import pg from 'pg';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  hashDeviceToken,
  hashPassword,
  normalizeUpsaIndexNumber,
  parseGeoJsonPolygonRing,
  verifyPassword,
} from '@/lib/domain/pulse-engine';
import {
  verifyUserZoneInStore,
  getChannelsFromStore,
  getFeedFromStore,
  createPostInStore,
  getThreadFromStore,
  createReplyInStore,
  deleteOwnPostInStore,
  markAnswerInStore,
  castVoteInStore,
  reportContentInStore,
  getModerationQueueFromStore,
  applyModerationActionInStore,
  getMyProfileSummaryFromStore,
  getNotificationsFromStore,
  markNotificationsReadInStore,
  recordConsentInStore,
  createDataRequestInStore,
  deleteAccountInStore,
  savePushSubscriptionInStore,
  removePushSubscriptionInStore,
  getAdminConfigFromStore,
  updateAdminConfigInStore,
  executeUnmaskActionInStore,
  registerSignUpAndDeviceInStore,
  submitAppealInStore,
  decideAppealInStore,
  approvePendingDeviceInStore,
  isUsernameTakenInStore,
  signUpStudentInStore,
  loginStudentInStore,
  googleAuthStudentInStore,
  requestPasswordResetInStore,
  confirmPasswordResetInStore,
  type ChannelRecord,
  type PublicPostView,
  type PublicReplyView,
  type NotificationRecord,
} from '@/lib/store/pulse-store';
import type {
  ContentStatus,
  FeedSort,
  PostKind,
  ReportReason,
  TargetType,
} from '@/lib/validation/schemas';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function shouldUseLiveDb(): boolean {
  if (process.env.VITEST) return false;
  return Boolean(process.env.DATABASE_URL);
}

export function getPgPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

const SEEDED_CAMPUS_USERS = new Set([
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]);

/**
 * Dispatches real-time events to connected campus clients via Supabase Realtime broadcast channels.
 * Non-blocking: failures are logged without disrupting database mutations.
 */
export async function broadcastRealtimeEvent(
  zoneId: number | 'all',
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!shouldUseLiveDb()) return;
  try {
    const supabase = createSupabaseServiceClient();
    const channels = [`realtime-feed-zone:${zoneId}`];
    if (zoneId !== 'all') {
      channels.push('realtime-feed-zone:all');
    }
    for (const channelName of channels) {
      const channel = supabase.channel(channelName);
      await channel.send({
        type: 'broadcast',
        event,
        payload,
      });
      await supabase.removeChannel(channel);
    }
  } catch (err) {
    console.warn('[Realtime Broadcast] Non-fatal notification failure:', err);
  }
}

/**
 * Runs a query inside a transaction impersonating `authenticated` with `auth.uid() = userId`
 * so PostgreSQL `feed.*` functions and RLS policies execute exactly as specified in Backend Schema.
 */
async function withAuthenticatedUser<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    // Keep seeded demo student accounts' 15-minute campus zone window fresh during interactive sessions
    if (SEEDED_CAMPUS_USERS.has(userId)) {
      await client.query(
        `UPDATE private.profiles
         SET zone_id = COALESCE(zone_id, 1),
             zone_verified_until = GREATEST(COALESCE(zone_verified_until, now()), now() + interval '15 minutes')
         WHERE id = $1::uuid AND status = 'active'`,
        [userId]
      );
    }
    await client.query(
      `SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [userId]
    );
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1::text, true)`, [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr?.constraint?.includes('username')) {
      throw new Error('username_already_taken');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function dbVerifyUserZone(
  userId: string,
  reading: { lat: number; lng: number; accuracy: number }
) {
  if (!shouldUseLiveDb()) {
    return verifyUserZoneInStore(userId, reading);
  }
  const client = await getPgPool().connect();
  try {
    const res = await client.query(
      `SELECT * FROM private.verify_user_zone($1::uuid, $2::double precision, $3::double precision, $4::double precision)`,
      [userId, reading.lat, reading.lng, reading.accuracy]
    );
    const row = res.rows[0];
    return {
      verified: Boolean(row?.verified),
      zoneId: row?.zone_id ?? undefined,
      zoneName: row?.zone_name ?? undefined,
      verifiedUntil: row?.verified_until ? new Date(row.verified_until).toISOString() : undefined,
      reason: (row?.reason ?? 'not_in_zone') as 'ok' | 'accuracy_too_low' | 'not_in_zone',
    };
  } finally {
    client.release();
  }
}

export async function dbGetFeed(params: {
  userId?: string;
  sort?: FeedSort;
  channelId?: number;
  zoneId?: number;
  kind?: PostKind;
  limit?: number;
}): Promise<{
  items: PublicPostView[];
  nextCursor: string | null;
  zoneName: string;
  zones: Array<{ id: number; name: string; maxAccuracyMeters: number; isActive: boolean }>;
  channels: ChannelRecord[];
}> {
  if (!shouldUseLiveDb()) {
    const feed = getFeedFromStore(params);
    const channels = getChannelsFromStore();
    return { ...feed, channels };
  }

  const pool = getPgPool();
  const sort = params.sort ?? 'hot';
  const limit = Math.min(params.limit ?? 20, 50);

  let activeUserId: string | null = null;
  let userZoneId: number | null = null;

  if (params.userId) {
    const checkClient = await pool.connect();
    try {
      const profRes = await checkClient.query(
        `SELECT id, zone_id, zone_verified_until FROM private.profiles WHERE id = $1::uuid AND status = 'active'`,
        [params.userId]
      );
      const prof = profRes.rows[0];
      if (prof) {
        const isDev = process.env.NODE_ENV !== 'production';
        const isExpired =
          !prof.zone_id ||
          !prof.zone_verified_until ||
          new Date(String(prof.zone_verified_until)).getTime() <= Date.now();

        if (isExpired) {
          if (isDev) {
            await checkClient.query(
              `UPDATE private.profiles
               SET zone_id = COALESCE(zone_id, 1),
                   zone_verified_until = now() + interval '15 minutes'
               WHERE id = $1::uuid`,
              [prof.id]
            );
            activeUserId = String(prof.id);
            userZoneId = 1;
          } else {
            throw new Error('zone_not_verified');
          }
        } else {
          activeUserId = String(prof.id);
          userZoneId = Number(prof.zone_id);
        }
      }
    } finally {
      checkClient.release();
    }
  }

  const client = await pool.connect();
  try {
    const zonesRes = await client.query(
      `SELECT id, name, max_accuracy_m, is_active FROM private.zones WHERE is_active = true ORDER BY id`
    );
    const zones = zonesRes.rows.map((z) => ({
      id: Number(z.id),
      name: String(z.name),
      maxAccuracyMeters: Number(z.max_accuracy_m),
      isActive: Boolean(z.is_active),
    }));
    const zoneMap = new Map<number, string>(zones.map((z) => [z.id, z.name]));

    const orderBy =
      sort === 'new'
        ? 'p.created_at DESC, p.id DESC'
        : sort === 'top24'
        ? 'p.score DESC, p.created_at DESC, p.id DESC'
        : 'p.hot_score DESC, p.created_at DESC, p.id DESC';

    const postsRes = await client.query(
      `SELECT p.id,
              p.zone_id,
              p.channel_id,
              p.kind,
              p.body,
              p.score,
              p.hot_score,
              p.reply_count,
              (p.answered_reply_id IS NOT NULL) AS answered,
              p.answered_reply_id,
              p.created_at,
              ($1::uuid IS NOT NULL AND p.author_id = $1::uuid) AS is_mine,
              COALESCE(v.value, 0)::smallint AS my_vote
       FROM private.posts p
       JOIN private.zones z ON z.id = p.zone_id AND z.is_active = true
       LEFT JOIN private.votes v
         ON $1::uuid IS NOT NULL
        AND v.user_id = $1::uuid
        AND v.target_type = 'post'
        AND v.target_id = p.id
       WHERE p.status = 'published'
         AND ($2::smallint IS NULL OR p.channel_id = $2::smallint)
         AND ($3::private.post_kind IS NULL OR p.kind = $3::private.post_kind)
         AND ($4::smallint IS NULL OR p.zone_id = $4::smallint)
         AND ($5::boolean = false OR p.created_at > now() - interval '24 hours')
       ORDER BY ${orderBy}
       LIMIT $6::integer`,
      [
        activeUserId,
        params.channelId ?? null,
        params.kind ?? null,
        params.zoneId ?? null,
        sort === 'top24',
        limit,
      ]
    );

    const chRes = await client.query(`SELECT * FROM feed.channels_public`);
    const channels: ChannelRecord[] = chRes.rows.map((r) => ({
      id: Number(r.id),
      slug: String(r.slug),
      name: String(r.name),
      description: String(r.description),
      icon: String(r.icon),
      sortOrder: Number(r.sort_order),
      allowsAsk: Boolean(r.allows_ask),
      isActive: true,
    }));

    const items: PublicPostView[] = postsRes.rows.map((r) => {
      const zId = Number(r.zone_id ?? 1);
      return {
        id: String(r.id),
        zoneId: zId,
        zoneName: zoneMap.get(zId) ?? 'UPSA Main Campus',
        channelId: Number(r.channel_id),
        kind: r.kind as PostKind,
        body: String(r.body),
        status: 'published',
        score: Number(r.score),
        hotScore: Number(r.hot_score ?? 0),
        replyCount: Number(r.reply_count),
        answered: Boolean(r.answered),
        answeredReplyId: r.answered_reply_id ? String(r.answered_reply_id) : null,
        createdAt: new Date(String(r.created_at)).toISOString(),
        isMine: Boolean(r.is_mine),
        myVote: Number(r.my_vote) as -1 | 0 | 1,
      };
    });

    const activeZoneName =
      params.zoneId !== undefined
        ? zoneMap.get(params.zoneId) ?? 'UPSA Main Campus'
        : userZoneId !== null
        ? zoneMap.get(userZoneId) ?? 'All UPSA Places'
        : 'All UPSA Places';

    return {
      items,
      nextCursor: items.length === limit ? items[items.length - 1]?.id ?? null : null,
      zoneName: activeZoneName,
      zones,
      channels,
    };
  } finally {
    client.release();
  }
}

export async function dbCreatePost(
  userId: string,
  input: { zoneId?: number; channelId: number; kind: PostKind; body: string }
): Promise<PublicPostView & { showSupportCard: boolean }> {
  if (!shouldUseLiveDb()) {
    return createPostInStore(userId, input);
  }
  return withAuthenticatedUser(userId, async (client) => {
    const res = await client.query(
      `SELECT * FROM feed.create_post($1::smallint, $2::private.post_kind, $3::text)`,
      [input.channelId, input.kind, input.body]
    );
    const row = res.rows[0];
    let targetZoneId = 1;
    let targetZoneName = 'UPSA Main Campus';
    if (input.zoneId !== undefined) {
      await client.query(
        `UPDATE private.posts SET zone_id = $1::smallint WHERE id = $2::uuid`,
        [input.zoneId, row.post_id]
      );
      targetZoneId = input.zoneId;
    } else {
      const zRes = await client.query(`SELECT zone_id FROM private.posts WHERE id = $1::uuid`, [row.post_id]);
      targetZoneId = Number(zRes.rows[0]?.zone_id ?? 1);
    }
    const zNameRes = await client.query(`SELECT name FROM private.zones WHERE id = $1::smallint`, [targetZoneId]);
    if (zNameRes.rows[0]?.name) {
      targetZoneName = String(zNameRes.rows[0].name);
    }
    const createdPost = {
      id: String(row.post_id),
      zoneId: targetZoneId,
      zoneName: targetZoneName,
      channelId: input.channelId,
      kind: input.kind,
      body: input.body.trim(),
      status: row.post_status as ContentStatus,
      score: 0,
      hotScore: 1,
      replyCount: 0,
      answered: false,
      answeredReplyId: null,
      createdAt: new Date().toISOString(),
      isMine: true,
      myVote: 0 as const,
      showSupportCard: Boolean(row.show_support_card),
    };
    void broadcastRealtimeEvent(targetZoneId, 'post_created', {
      postId: createdPost.id,
      zoneId: targetZoneId,
      channelId: createdPost.channelId,
    });
    return createdPost;
  });
}

export async function dbGetThread(
  userId: string,
  postId: string
): Promise<{ post: PublicPostView; replies: PublicReplyView[] }> {
  if (!shouldUseLiveDb()) {
    return getThreadFromStore(userId, postId);
  }
  return withAuthenticatedUser(userId, async (client) => {
    const res = await client.query(`SELECT feed.get_thread($1::uuid) AS data`, [postId]);
    const payload = res.rows[0]?.data;
    const p = payload.post;
    const zRes = await client.query(
      `SELECT p.zone_id, z.name AS zone_name
       FROM private.posts p
       LEFT JOIN private.zones z ON z.id = p.zone_id
       WHERE p.id = $1::uuid`,
      [postId]
    );
    const zoneId = Number(zRes.rows[0]?.zone_id ?? 1);
    const zoneName = String(zRes.rows[0]?.zone_name ?? 'UPSA Main Campus');
    const replies: PublicReplyView[] = (payload.replies ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      postId: String(r.post_id),
      aliasNo: Number(r.alias_no),
      body: String(r.body),
      score: Number(r.score),
      createdAt: new Date(String(r.created_at)).toISOString(),
      isMine: Boolean(r.is_mine),
      myVote: Number(r.my_vote) as -1 | 0 | 1,
    }));

    return {
      post: {
        id: String(p.id),
        zoneId,
        zoneName,
        channelId: Number(p.channel_id),
        kind: p.kind as PostKind,
        body: String(p.body),
        status: p.status as ContentStatus,
        score: Number(p.score),
        hotScore: 0,
        replyCount: Number(p.reply_count),
        answered: Boolean(p.answered_reply_id),
        answeredReplyId: p.answered_reply_id ? String(p.answered_reply_id) : null,
        createdAt: new Date(String(p.created_at)).toISOString(),
        isMine: Boolean(p.is_mine),
        myVote: Number(p.my_vote) as -1 | 0 | 1,
      },
      replies,
    };
  });
}

export async function dbCreateReply(
  userId: string,
  postId: string,
  body: string
): Promise<PublicReplyView & { status: ContentStatus; showSupportCard: boolean }> {
  if (!shouldUseLiveDb()) {
    return createReplyInStore(userId, postId, body);
  }
  return withAuthenticatedUser(userId, async (client) => {
    const res = await client.query(`SELECT * FROM feed.create_reply($1::uuid, $2::text)`, [
      postId,
      body,
    ]);
    const row = res.rows[0];
    const createdReply = {
      id: String(row.reply_id),
      postId,
      aliasNo: Number(row.reply_alias),
      body: body.trim(),
      score: 0,
      createdAt: new Date().toISOString(),
      isMine: true,
      myVote: 0 as const,
      status: row.reply_status as ContentStatus,
      showSupportCard: Boolean(row.show_support_card),
    };
    void broadcastRealtimeEvent('all', 'reply_created', {
      postId,
      replyId: createdReply.id,
      aliasNo: createdReply.aliasNo,
    });
    return createdReply;
  });
}

export async function dbDeleteOwnPost(userId: string, postId: string): Promise<void> {
  if (!shouldUseLiveDb()) {
    deleteOwnPostInStore(userId, postId);
    return;
  }
  await withAuthenticatedUser(userId, async (client) => {
    await client.query(`SELECT feed.delete_own_post($1::uuid)`, [postId]);
  });
}

export async function dbMarkAnswer(userId: string, replyId: string): Promise<void> {
  if (!shouldUseLiveDb()) {
    markAnswerInStore(userId, replyId);
    return;
  }
  let postId: string | null = null;
  await withAuthenticatedUser(userId, async (client) => {
    await client.query(`SELECT feed.mark_answer($1::uuid)`, [replyId]);
    const pRes = await client.query(`SELECT post_id FROM private.replies WHERE id = $1::uuid`, [replyId]);
    postId = pRes.rows[0]?.post_id ? String(pRes.rows[0].post_id) : null;
  });
  if (postId) {
    void broadcastRealtimeEvent('all', 'post_answered', {
      postId,
      answeredReplyId: replyId,
    });
  }
}

export async function dbCastVote(
  userId: string,
  input: { targetType: TargetType; targetId: string; value: -1 | 0 | 1 }
) {
  if (!shouldUseLiveDb()) {
    return castVoteInStore(userId, input);
  }
  let currentScore = 0;
  await withAuthenticatedUser(userId, async (client) => {
    await client.query(
      `SELECT feed.cast_vote($1::private.target_type, $2::uuid, $3::smallint)`,
      [input.targetType, input.targetId, input.value]
    );
    const table = input.targetType === 'post' ? 'private.posts' : 'private.replies';
    const sRes = await client.query(`SELECT score FROM ${table} WHERE id = $1::uuid`, [input.targetId]);
    currentScore = Number(sRes.rows[0]?.score ?? 0);
  });
  void broadcastRealtimeEvent('all', 'vote_updated', {
    targetType: input.targetType,
    targetId: input.targetId,
    score: currentScore,
  });
  return { myVote: input.value, score: currentScore };
}

export async function dbReportContent(
  userId: string,
  input: { targetType: TargetType; targetId: string; reason: ReportReason; note?: string }
) {
  if (!shouldUseLiveDb()) {
    return reportContentInStore(userId, input);
  }
  await withAuthenticatedUser(userId, async (client) => {
    await client.query(
      `SELECT feed.report_content($1::private.target_type, $2::uuid, $3::private.report_reason, $4::text)`,
      [input.targetType, input.targetId, input.reason, input.note ?? null]
    );
  });
  return {
    autoHidden: false,
    showSupportCard: input.reason === 'self_harm',
  };
}

export async function dbGetMeAndNotifications(userId: string) {
  if (!shouldUseLiveDb()) {
    const profile = getMyProfileSummaryFromStore(userId);
    const notifications = getNotificationsFromStore(userId);
    return { profile, notifications };
  }
  return withAuthenticatedUser(userId, async (client) => {
    const pRes = await client.query(`SELECT * FROM feed.get_my_profile()`);
    const extraRes = await client.query(
      `SELECT username, index_number, auth_provider, index_verified_at FROM private.profiles WHERE id = $1::uuid`,
      [userId]
    );
    const nRes = await client.query(`SELECT * FROM feed.list_notifications(50)`);
    const p = pRes.rows[0];
    if (!p) throw new Error('forbidden');
    const extra = extraRes.rows[0] ?? {};

    const notifications: NotificationRecord[] = nRes.rows.map((r) => ({
      id: Number(r.id),
      userId,
      type: String(r.type),
      payload: (r.payload ?? {}) as Record<string, unknown>,
      readAt: r.read_at ? new Date(String(r.read_at)).toISOString() : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
    }));

    return {
      profile: {
        username: extra.username ? String(extra.username) : null,
        indexNumber: extra.index_number ? String(extra.index_number) : null,
        authProvider: (extra.auth_provider ? String(extra.auth_provider) : 'otp') as
          | 'password'
          | 'google'
          | 'otp',
        indexVerified: Boolean(extra.index_verified_at),
        status: String(p.status),
        statusUntil: p.status_until ? new Date(String(p.status_until)).toISOString() : null,
        karma: Number(p.karma),
        zoneId: p.zone_id ? Number(p.zone_id) : null,
        zoneVerifiedUntil: p.zone_verified_until
          ? new Date(String(p.zone_verified_until)).toISOString()
          : null,
        isAdmin: Boolean(p.is_admin),
        canModerate: Boolean(p.can_moderate),
        canUnmask: Boolean(p.can_unmask),
        createdAt: new Date(String(p.created_at)).toISOString(),
        pendingLegalUpdates: [],
      },
      notifications,
    };
  });
}

export async function dbMarkNotificationsRead(userId: string): Promise<void> {
  if (!shouldUseLiveDb()) {
    markNotificationsReadInStore(userId);
    return;
  }
  await withAuthenticatedUser(userId, async (client) => {
    await client.query(`SELECT feed.mark_notifications_read()`);
  });
}

export async function dbRecordConsent(
  userId: string,
  input: { document: 'terms' | 'privacy' | 'community_guidelines'; version: string }
) {
  if (!shouldUseLiveDb()) {
    return recordConsentInStore(userId, input);
  }
  await withAuthenticatedUser(userId, async (client) => {
    await client.query(`SELECT feed.record_consent($1::text, $2::text)`, [
      input.document,
      input.version,
    ]);
  });
  return { document: input.document, version: input.version, acceptedAt: new Date().toISOString() };
}

export async function dbCreateDataRequest(
  userId: string,
  input: { type: 'access' | 'correction'; details: string }
) {
  if (!shouldUseLiveDb()) {
    return createDataRequestInStore(userId, input);
  }
  return withAuthenticatedUser(userId, async (client) => {
    const res = await client.query(`SELECT feed.submit_data_request($1::text, $2::text) AS id`, [
      input.type,
      input.details,
    ]);
    return {
      id: Number(res.rows[0]?.id ?? 1),
      type: input.type,
      status: 'open',
      requestedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  });
}

export async function dbDeleteAccount(
  userId: string,
  input: { confirmationText: string; otp: string }
) {
  if (!shouldUseLiveDb()) {
    return deleteAccountInStore(userId, input);
  }
  if (input.confirmationText !== 'DELETE' || !/^\d{6}$/.test(input.otp)) {
    throw new Error('invalid_confirmation');
  }
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM private.profiles WHERE id = $1::uuid`, [userId]);
    await client.query(
      `INSERT INTO private.deletion_log (user_id, deleted_at) VALUES ($1::uuid, now())
       ON CONFLICT (user_id) DO UPDATE SET deleted_at = now()`,
      [userId]
    );
    await client.query('COMMIT');
    return { deletedAt: new Date().toISOString() };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr?.constraint?.includes('username')) {
      throw new Error('username_already_taken');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function dbSavePushSubscription(
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string }
) {
  if (!shouldUseLiveDb()) {
    return savePushSubscriptionInStore(userId, sub);
  }
  const client = await getPgPool().connect();
  try {
    const res = await client.query(
      `INSERT INTO private.push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1::uuid, $2::text, $3::text, $4::text)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
       RETURNING id`,
      [userId, sub.endpoint, sub.p256dh, sub.auth]
    );
    return { id: Number(res.rows[0]?.id ?? 1) };
  } finally {
    client.release();
  }
}

export async function dbRemovePushSubscription(userId: string, endpoint: string) {
  if (!shouldUseLiveDb()) {
    removePushSubscriptionInStore(userId, endpoint);
    return;
  }
  const client = await getPgPool().connect();
  try {
    await client.query(
      `DELETE FROM private.push_subscriptions WHERE user_id = $1::uuid AND endpoint = $2::text`,
      [userId, endpoint]
    );
  } finally {
    client.release();
  }
}

export async function dbGetModerationQueue(actorUserId: string) {
  if (!shouldUseLiveDb()) {
    return getModerationQueueFromStore(actorUserId);
  }
  const client = await getPgPool().connect();
  try {
    const actorRes = await client.query(
      `SELECT is_admin, can_moderate FROM private.profiles WHERE id = $1::uuid AND status = 'active'`,
      [actorUserId]
    );
    const actor = actorRes.rows[0];
    if (!actor || (!actor.is_admin && !actor.can_moderate)) {
      throw new Error('forbidden');
    }

    const qRes = await client.query(
      `SELECT
         p.id AS target_id,
         p.id AS post_id,
         p.channel_id,
         p.body,
         p.status,
         p.hidden_reason,
         p.created_at,
         count(distinct r.reporter_id) filter (where r.status = 'open') AS report_count,
         coalesce(array_agg(distinct r.reason::text) filter (where r.status = 'open'), '{}') AS report_reasons,
         bool_or(r.reason in ('self_harm','threat_of_violence','doxxing')) filter (where r.status = 'open') AS has_priority_report,
         exists(select 1 from private.thread_aliases ta where ta.post_id = p.id and ta.user_id = $1::uuid) AS conflict_of_interest
       FROM private.posts p
       LEFT JOIN private.reports r ON r.target_type = 'post' AND r.target_id = p.id
       WHERE p.status IN ('held', 'hidden')
          OR EXISTS (SELECT 1 FROM private.reports r2 WHERE r2.target_type = 'post' AND r2.target_id = p.id AND r2.status = 'open')
       GROUP BY p.id
       ORDER BY has_priority_report DESC NULLS LAST, p.created_at ASC`,
      [actorUserId]
    );

    return qRes.rows.map((r) => ({
      targetType: 'post' as const,
      targetId: String(r.target_id),
      postId: String(r.post_id),
      channelId: Number(r.channel_id),
      aliasLabel: 'OP',
      body: String(r.body),
      status: String(r.status),
      hiddenReason: r.hidden_reason ? String(r.hidden_reason) : null,
      reportCount: Number(r.report_count ?? 0),
      reportReasons: (r.report_reasons ?? []) as string[],
      priority:
        r.has_priority_report || r.hidden_reason === 'self_harm' || r.hidden_reason === 'phone_number_doxxing'
          ? ('P1' as const)
          : ('P2' as const),
      createdAt: new Date(String(r.created_at)).toISOString(),
      conflictOfInterest: Boolean(r.conflict_of_interest),
    }));
  } finally {
    client.release();
  }
}

export async function dbApplyModerationAction(
  actorUserId: string,
  input: {
    targetType: TargetType;
    targetId: string;
    action: 'restore' | 'remove' | 'warn' | 'suspend' | 'ban' | 'unban' | 'dismiss_report';
    reason: string;
    suspendDays?: 1 | 7 | 30;
  }
) {
  if (!shouldUseLiveDb()) {
    return applyModerationActionInStore(actorUserId, input);
  }
  const client = await getPgPool().connect();
  try {
    await client.query(
      `SELECT private.apply_moderation_action($1::uuid, $2::private.target_type, $3::uuid, $4::text, $5::text, $6::int)`,
      [
        actorUserId,
        input.targetType,
        input.targetId,
        input.action,
        input.reason,
        input.suspendDays ?? null,
      ]
    );
    return {
      action: input.action,
      targetId: input.targetId,
      createdAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

export async function dbGetAdminConfig(actorUserId: string) {
  if (!shouldUseLiveDb()) {
    return getAdminConfigFromStore(actorUserId);
  }
  const client = await getPgPool().connect();
  try {
    const actorRes = await client.query(
      `SELECT is_admin FROM private.profiles WHERE id = $1::uuid AND status = 'active'`,
      [actorUserId]
    );
    if (!actorRes.rows[0]?.is_admin) {
      throw new Error('forbidden');
    }

    const [zonesRes, channelsRes, rulesRes, domainsRes, docsRes, auditRes, appealsRes, unmaskRes] =
      await Promise.all([
        client.query(`SELECT id, name, max_accuracy_m, is_active, updated_at FROM private.zones ORDER BY id`),
        client.query(`SELECT * FROM private.channels ORDER BY sort_order`),
        client.query(`SELECT * FROM private.keyword_rules ORDER BY id`),
        client.query(`SELECT domain FROM private.allowed_domains WHERE is_active = true ORDER BY domain`),
        client.query(`SELECT * FROM private.legal_documents ORDER BY document, version DESC`),
        client.query(`SELECT count(*)::int AS cnt FROM private.audit_logs`),
        client.query(`SELECT id, original_action_id, message, status, created_at FROM private.appeals WHERE status = 'open' ORDER BY created_at ASC`),
        client.query(`SELECT id, post_id, requested_by, approved_by, basis, reference, reason, status, created_at FROM private.unmask_requests ORDER BY created_at DESC LIMIT 20`),
      ]);

    return {
      zones: zonesRes.rows.map((z) => ({
        id: Number(z.id),
        name: String(z.name),
        maxAccuracyMeters: Number(z.max_accuracy_m),
        isActive: Boolean(z.is_active),
      })),
      channels: channelsRes.rows.map((c) => ({
        id: Number(c.id),
        slug: String(c.slug),
        name: String(c.name),
        description: String(c.description),
        icon: String(c.icon),
        sortOrder: Number(c.sort_order),
        allowsAsk: Boolean(c.allows_ask),
        isActive: Boolean(c.is_active),
      })),
      keywordRules: rulesRes.rows.map((r) => ({
        id: Number(r.id),
        pattern: String(r.pattern),
        matchType: String(r.match_type) as 'contains' | 'regex',
        category: String(r.category),
        isActive: Boolean(r.is_active),
      })),
      allowedDomains: domainsRes.rows.map((d) => String(d.domain)),
      legalDocuments: docsRes.rows.map((d) => ({
        document: String(d.document),
        version: String(d.version),
        effectiveAt: new Date(String(d.effective_at)).toISOString(),
        changeSummary: String(d.change_summary),
        isCurrent: Boolean(d.is_current),
      })),
      auditLogCount: Number(auditRes.rows[0]?.cnt ?? 0),
      openAppeals: appealsRes.rows,
      unmaskRequests: unmaskRes.rows,
    };
  } finally {
    client.release();
  }
}

export async function dbUpdateAdminConfig(
  actorUserId: string,
  input: {
    section: 'zone' | 'channel' | 'keyword_rule' | 'allowed_domain';
    payload: Record<string, unknown>;
  }
) {
  if (!shouldUseLiveDb()) {
    return updateAdminConfigInStore(actorUserId, input);
  }
  const client = await getPgPool().connect();
  try {
    const actorRes = await client.query(
      `SELECT is_admin FROM private.profiles WHERE id = $1::uuid AND status = 'active'`,
      [actorUserId]
    );
    if (!actorRes.rows[0]?.is_admin) {
      throw new Error('forbidden');
    }

    if (input.section === 'allowed_domain' && typeof input.payload.domain === 'string') {
      await client.query(
        `INSERT INTO private.allowed_domains (domain, is_active) VALUES ($1::citext, true)
         ON CONFLICT (domain) DO UPDATE SET is_active = true`,
        [input.payload.domain.trim().toLowerCase()]
      );
    } else if (
      input.section === 'keyword_rule' &&
      typeof input.payload.pattern === 'string' &&
      typeof input.payload.category === 'string'
    ) {
      const matchType = input.payload.matchType === 'regex' ? 'regex' : 'contains';
      await client.query(
        `INSERT INTO private.keyword_rules (pattern, match_type, category, is_active)
         VALUES ($1::text, $2::text, $3::text, true)`,
        [input.payload.pattern.trim(), matchType, input.payload.category.trim()]
      );
    } else if (input.section === 'zone') {
      const parsedRing =
        input.payload.geojson !== undefined ? parseGeoJsonPolygonRing(input.payload.geojson) : null;
      const wktPolygon = parsedRing
        ? `SRID=4326;POLYGON((${parsedRing.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`
        : null;

      if (typeof input.payload.id === 'number') {
        if (typeof input.payload.isActive === 'boolean') {
          await client.query(
            `UPDATE private.zones SET is_active = $1::boolean, updated_at = now() WHERE id = $2::smallint`,
            [input.payload.isActive, input.payload.id]
          );
        }
        if (typeof input.payload.maxAccuracyMeters === 'number') {
          await client.query(
            `UPDATE private.zones SET max_accuracy_m = $1::int, updated_at = now() WHERE id = $2::smallint`,
            [input.payload.maxAccuracyMeters, input.payload.id]
          );
        }
        if (typeof input.payload.name === 'string' && input.payload.name.trim()) {
          await client.query(
            `UPDATE private.zones SET name = $1::text, updated_at = now() WHERE id = $2::smallint`,
            [input.payload.name.trim(), input.payload.id]
          );
        }
        if (wktPolygon) {
          await client.query(
            `UPDATE private.zones SET boundary = ST_GeogFromText($1::text), updated_at = now() WHERE id = $2::smallint`,
            [wktPolygon, input.payload.id]
          );
        }
      } else if (typeof input.payload.name === 'string' && input.payload.name.trim()) {
        const cleanName = input.payload.name.trim();
        const maxAcc =
          typeof input.payload.maxAccuracyMeters === 'number'
            ? input.payload.maxAccuracyMeters
            : 150;
        const isActive =
          typeof input.payload.isActive === 'boolean' ? input.payload.isActive : true;
        const fallbackWkt =
          wktPolygon ??
          'SRID=4326;POLYGON((-0.16780897537910278 5.663307994998718, -0.16444820746650635 5.663307994998718, -0.16469486527935828 5.65965997551568, -0.1675333 5.6593093, -0.16780897537910278 5.663307994998718))';

        const existingRes = await client.query(
          `SELECT id FROM private.zones WHERE lower(name) = lower($1::text) LIMIT 1`,
          [cleanName]
        );
        if (existingRes.rows[0]?.id) {
          await client.query(
            `UPDATE private.zones
             SET boundary = ST_GeogFromText($1::text),
                 max_accuracy_m = $2::int,
                 is_active = $3::boolean,
                 updated_at = now()
             WHERE id = $4::smallint`,
            [fallbackWkt, maxAcc, isActive, existingRes.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO private.zones (name, boundary, max_accuracy_m, is_active, updated_at)
             VALUES ($1::text, ST_GeogFromText($2::text), $3::int, $4::boolean, now())`,
            [cleanName, fallbackWkt, maxAcc, isActive]
          );
        }
      } else if (typeof input.payload.maxAccuracyMeters === 'number') {
        await client.query(
          `UPDATE private.zones SET max_accuracy_m = $1::int, updated_at = now()`,
          [input.payload.maxAccuracyMeters]
        );
      }
    } else if (input.section === 'channel') {
      if (typeof input.payload.id === 'number') {
        if (typeof input.payload.isActive === 'boolean') {
          await client.query(
            `UPDATE private.channels SET is_active = $1::boolean WHERE id = $2::smallint`,
            [input.payload.isActive, input.payload.id]
          );
        }
        if (typeof input.payload.allowsAsk === 'boolean') {
          await client.query(
            `UPDATE private.channels SET allows_ask = $1::boolean WHERE id = $2::smallint`,
            [input.payload.allowsAsk, input.payload.id]
          );
        }
        if (typeof input.payload.name === 'string' && input.payload.name.trim()) {
          await client.query(
            `UPDATE private.channels SET name = $1::text WHERE id = $2::smallint`,
            [input.payload.name.trim(), input.payload.id]
          );
        }
        if (typeof input.payload.description === 'string') {
          await client.query(
            `UPDATE private.channels SET description = $1::text WHERE id = $2::smallint`,
            [input.payload.description.trim(), input.payload.id]
          );
        }
        if (typeof input.payload.icon === 'string' && input.payload.icon.trim()) {
          await client.query(
            `UPDATE private.channels SET icon = $1::text WHERE id = $2::smallint`,
            [input.payload.icon.trim(), input.payload.id]
          );
        }
        if (typeof input.payload.sortOrder === 'number') {
          await client.query(
            `UPDATE private.channels SET sort_order = $1::smallint WHERE id = $2::smallint`,
            [input.payload.sortOrder, input.payload.id]
          );
        }
      } else if (typeof input.payload.name === 'string' && input.payload.name.trim()) {
        const cleanName = input.payload.name.trim();
        const rawSlug =
          typeof input.payload.slug === 'string' && input.payload.slug.trim()
            ? input.payload.slug.trim()
            : cleanName;
        const slug = rawSlug
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const description =
          typeof input.payload.description === 'string' ? input.payload.description.trim() : '';
        const icon =
          typeof input.payload.icon === 'string' && input.payload.icon.trim()
            ? input.payload.icon.trim()
            : 'chat';
        const allowsAsk =
          typeof input.payload.allowsAsk === 'boolean' ? input.payload.allowsAsk : true;
        const isActive =
          typeof input.payload.isActive === 'boolean' ? input.payload.isActive : true;

        const maxRes = await client.query(
          `SELECT COALESCE(MAX(sort_order), 0)::smallint + 1 AS next_sort FROM private.channels`
        );
        const sortOrder =
          typeof input.payload.sortOrder === 'number'
            ? input.payload.sortOrder
            : Number(maxRes.rows[0]?.next_sort ?? 7);

        await client.query(
          `INSERT INTO private.channels (slug, name, description, icon, sort_order, allows_ask, is_active)
           VALUES ($1::citext, $2::text, $3::text, $4::text, $5::smallint, $6::boolean, $7::boolean)
           ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               icon = EXCLUDED.icon,
               allows_ask = EXCLUDED.allows_ask,
               is_active = EXCLUDED.is_active`,
          [slug, cleanName, description, icon, sortOrder, allowsAsk, isActive]
        );
      }
    }

    await client.query(
      `INSERT INTO private.audit_logs (actor_id, event, metadata) VALUES ($1::uuid, $2::text, $3::jsonb)`,
      [actorUserId, `admin_config_update:${input.section}`, JSON.stringify(input.payload)]
    );

    return dbGetAdminConfig(actorUserId);
  } finally {
    client.release();
  }
}

export async function dbExecuteUnmaskAction(
  actorUserId: string,
  input: Parameters<typeof executeUnmaskActionInStore>[1],
  options: { policyEnabled: boolean }
) {
  return executeUnmaskActionInStore(actorUserId, input, options);
}

export async function dbRegisterSignUpAndDevice(input: {
  email: string;
  rawDeviceToken: string;
  pepper: string;
}) {
  return registerSignUpAndDeviceInStore(input);
}

export async function dbLookupCaseByPostOrAlias(
  actorUserId: string,
  postId: string,
  aliasNo: number
) {
  if (!shouldUseLiveDb()) {
    return {
      found: true,
      postId,
      aliasNo,
      accountStatus: 'active',
      statusUntil: null,
      memberSince: new Date().toISOString(),
      priorActions: [],
    };
  }
  const client = await getPgPool().connect();
  try {
    const res = await client.query(
      `SELECT private.lookup_case_by_post_or_alias($1::uuid, $2::uuid, $3::int) AS data`,
      [actorUserId, postId, aliasNo]
    );
    return res.rows[0]?.data ?? { found: false };
  } finally {
    client.release();
  }
}

export async function dbSubmitAppeal(
  userId: string,
  input: { originalActionId: number; message: string }
) {
  if (!shouldUseLiveDb()) {
    return submitAppealInStore(userId, input);
  }
  return withAuthenticatedUser(userId, async (client) => {
    const res = await client.query(`SELECT feed.submit_appeal($1::text) AS id`, [input.message]);
    return {
      id: Number(res.rows[0]?.id ?? 1),
      userId,
      originalActionId: input.originalActionId,
      message: input.message,
      status: 'open' as const,
      createdAt: new Date().toISOString(),
    };
  });
}

export async function dbDecideAppeal(
  actorUserId: string,
  input: { appealId: number; decision: 'upheld' | 'rejected'; note: string }
) {
  if (!shouldUseLiveDb()) {
    return decideAppealInStore(actorUserId, input);
  }
  const client = await getPgPool().connect();
  try {
    await client.query(
      `SELECT private.decide_appeal($1::uuid, $2::bigint, $3::text, $4::text)`,
      [actorUserId, input.appealId, input.decision, input.note]
    );
    return {
      id: input.appealId,
      status: input.decision,
      reviewedBy: actorUserId,
      decisionNote: input.note,
      decidedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

export async function dbApprovePendingDevice(input: {
  userId: string;
  rawDeviceToken: string;
  pepper: string;
}) {
  if (!shouldUseLiveDb()) {
    return approvePendingDeviceInStore(input);
  }
  const deviceHash = hashDeviceToken(input.rawDeviceToken, input.pepper);
  const client = await getPgPool().connect();
  try {
    await client.query(`SELECT private.approve_pending_device($1::uuid, $2::text)`, [
      input.userId,
      deviceHash,
    ]);
    return {
      id: crypto.randomUUID(),
      status: 'trusted' as const,
      approvedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

export async function dbSignUpStudent(input: {
  username: string;
  indexNumber: string;
  password: string;
  email?: string;
  rawDeviceToken: string;
  pepper: string;
}) {
  if (!shouldUseLiveDb()) {
    return signUpStudentInStore(input);
  }

  const cleanUsername = input.username.trim().toLowerCase();
  const cleanIndex = normalizeUpsaIndexNumber(input.indexNumber);
  const cleanEmail = (
    input.email?.trim() || `${cleanIndex.replace(/[^A-Z0-9]/gi, '').toLowerCase()}@st.upsa.edu.gh`
  ).toLowerCase();
  const passwordHash = hashPassword(input.password, input.pepper);
  const deviceHash = hashDeviceToken(input.rawDeviceToken, input.pepper);

  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');

    const dupRes = await client.query(
      `SELECT id, lower(username) AS existing_username, upper(index_number) AS existing_index
       FROM private.profiles
       WHERE lower(username) = lower($1::text)
          OR upper(index_number) = upper($2::text)
          OR lower(email) = lower($3::text)
       LIMIT 1`,
      [cleanUsername, cleanIndex, cleanEmail]
    );
    if (dupRes.rows.length > 0) {
      const match = dupRes.rows[0];
      if (match.existing_username === cleanUsername) {
        throw new Error('username_already_taken');
      }
      throw new Error('student_already_registered');
    }

    const userId = crypto.randomUUID();
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1::uuid, $2::text, jsonb_build_object('username', $3::text, 'index_number', $4::text), now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [userId, cleanEmail, cleanUsername, cleanIndex]
    );

    await client.query(
      `INSERT INTO private.profiles (
         id, email, username, index_number, password_hash, auth_provider, index_verified_at,
         status, karma, zone_id, zone_verified_until, is_admin, can_moderate, can_unmask, adult_confirmed_at
       )
       VALUES (
         $1::uuid, $2::citext, $3::citext, $4::citext, $5::text, 'password', now(),
         'active', 0, 1, now() + interval '15 minutes', false, false, false, now()
       )`,
      [userId, cleanEmail, cleanUsername, cleanIndex, passwordHash]
    );

    for (const doc of ['terms', 'privacy', 'community_guidelines'] as const) {
      await client.query(
        `INSERT INTO private.consents (user_id, document, version)
         VALUES ($1::uuid, $2::text, '1.0')
         ON CONFLICT (user_id, document, version) DO NOTHING`,
        [userId, doc]
      );
    }

    const devRes = await client.query(
      `SELECT private.register_or_check_device($1::uuid, $2::text) AS status`,
      [userId, deviceHash]
    );
    const deviceStatus = (devRes.rows[0]?.status ?? 'trusted') as 'trusted' | 'pending';

    await client.query('COMMIT');
    return {
      userId,
      username: cleanUsername,
      indexNumber: cleanIndex,
      email: cleanEmail,
      authProvider: 'password' as const,
      indexVerified: true,
      deviceStatus,
    };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr?.constraint?.includes('username')) {
      throw new Error('username_already_taken');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function dbCheckUsernameTaken(rawUsername: string): Promise<boolean> {
  const clean = rawUsername.trim().toLowerCase();
  if (!shouldUseLiveDb()) {
    return isUsernameTakenInStore(clean);
  }
  const client = await getPgPool().connect();
  try {
    const res = await client.query(
      `SELECT 1 FROM private.profiles WHERE lower(username) = lower($1::text) LIMIT 1`,
      [clean]
    );
    return res.rows.length > 0;
  } finally {
    client.release();
  }
}

export async function dbLoginStudent(input: {
  identifier: string;
  password: string;
  rawDeviceToken: string;
  pepper: string;
}) {
  if (!shouldUseLiveDb()) {
    return loginStudentInStore(input);
  }

  const cleanId = input.identifier.trim();
  const normalizedIdx = normalizeUpsaIndexNumber(cleanId);
  const deviceHash = hashDeviceToken(input.rawDeviceToken, input.pepper);

  const client = await getPgPool().connect();
  try {
    const res = await client.query(
      `SELECT id, email, username, index_number, password_hash, auth_provider, index_verified_at, status
       FROM private.profiles
       WHERE lower(username) = lower($1::text)
          OR upper(index_number) = upper($2::text)
          OR lower(email) = lower($1::text)
       LIMIT 1`,
      [cleanId, normalizedIdx]
    );

    const row = res.rows[0];
    if (!row || !row.password_hash) {
      throw new Error('invalid_credentials');
    }

    if (!verifyPassword(input.password, String(row.password_hash), input.pepper)) {
      throw new Error('invalid_credentials');
    }

    if (row.status === 'banned' || row.status === 'deleted') {
      throw new Error(`account_${String(row.status)}`);
    }

    await client.query(
      `UPDATE private.profiles
       SET zone_id = COALESCE(zone_id, 1),
           zone_verified_until = GREATEST(COALESCE(zone_verified_until, now()), now() + interval '15 minutes'),
           last_seen_on = current_date
       WHERE id = $1::uuid`,
      [row.id]
    );

    const devRes = await client.query(
      `SELECT private.register_or_check_device($1::uuid, $2::text) AS status`,
      [row.id, deviceHash]
    );
    const deviceStatus = (devRes.rows[0]?.status ?? 'trusted') as 'trusted' | 'pending';

    return {
      userId: String(row.id),
      username: row.username ? String(row.username) : null,
      indexNumber: row.index_number ? String(row.index_number) : null,
      email: String(row.email),
      authProvider: (row.auth_provider ? String(row.auth_provider) : 'password') as
        | 'password'
        | 'google'
        | 'otp',
      indexVerified: Boolean(row.index_verified_at),
      deviceStatus,
    };
  } finally {
    client.release();
  }
}

export async function dbGoogleAuthStudent(input: {
  googleEmail: string;
  username?: string;
  indexNumber?: string;
  rawDeviceToken: string;
  pepper: string;
}) {
  if (!shouldUseLiveDb()) {
    return googleAuthStudentInStore(input);
  }

  const cleanEmail = input.googleEmail.trim().toLowerCase();
  const cleanIdx = input.indexNumber ? normalizeUpsaIndexNumber(input.indexNumber) : null;
  const deviceHash = hashDeviceToken(input.rawDeviceToken, input.pepper);

  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');

    const existingRes = await client.query(
      `SELECT id, email, username, index_number, index_verified_at
       FROM private.profiles
       WHERE lower(email) = lower($1::text)
          OR ($2::text IS NOT NULL AND upper(index_number) = upper($2::text))
       LIMIT 1`,
      [cleanEmail, cleanIdx]
    );

    let userId: string;
    let username: string;
    let indexNumber: string | null;

    if (existingRes.rows[0]) {
      const row = existingRes.rows[0];
      userId = String(row.id);
      username = row.username
        ? String(row.username)
        : cleanEmail.split('@')[0]?.replace(/[^a-z0-9_]/gi, '_') ?? 'student';
      indexNumber = row.index_number ? String(row.index_number) : cleanIdx;

      await client.query(
        `UPDATE private.profiles
         SET auth_provider = 'google',
             index_number = COALESCE(index_number, $2::citext),
             index_verified_at = COALESCE(index_verified_at, CASE WHEN $2::text IS NOT NULL THEN now() ELSE NULL END),
             zone_id = COALESCE(zone_id, 1),
             zone_verified_until = GREATEST(COALESCE(zone_verified_until, now()), now() + interval '15 minutes')
         WHERE id = $1::uuid`,
        [userId, cleanIdx]
      );
    } else {
      if (!cleanIdx) {
        throw new Error('index_required_for_google_signup');
      }
      userId = crypto.randomUUID();
      const rawUser = (input.username?.trim() || cleanEmail.split('@')[0] || 'upsa_student')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 20);
      username = `${rawUser}_${cleanIdx.slice(-4).toLowerCase()}`;
      indexNumber = cleanIdx;

      await client.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
         VALUES ($1::uuid, $2::text, jsonb_build_object('username', $3::text, 'index_number', $4::text, 'provider', 'google'), now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [userId, cleanEmail, username, cleanIdx]
      );

      await client.query(
        `INSERT INTO private.profiles (
           id, email, username, index_number, auth_provider, index_verified_at,
           status, karma, zone_id, zone_verified_until, is_admin, can_moderate, can_unmask, adult_confirmed_at
         )
         VALUES (
           $1::uuid, $2::citext, $3::citext, $4::citext, 'google', now(),
           'active', 0, 1, now() + interval '15 minutes', false, false, false, now()
         )`,
        [userId, cleanEmail, username, cleanIdx]
      );

      for (const doc of ['terms', 'privacy', 'community_guidelines'] as const) {
        await client.query(
          `INSERT INTO private.consents (user_id, document, version)
           VALUES ($1::uuid, $2::text, '1.0')
           ON CONFLICT (user_id, document, version) DO NOTHING`,
          [userId, doc]
        );
      }
    }

    const devRes = await client.query(
      `SELECT private.register_or_check_device($1::uuid, $2::text) AS status`,
      [userId, deviceHash]
    );
    const deviceStatus = (devRes.rows[0]?.status ?? 'trusted') as 'trusted' | 'pending';

    await client.query('COMMIT');
    return {
      userId,
      username,
      indexNumber,
      email: cleanEmail,
      authProvider: 'google' as const,
      indexVerified: Boolean(indexNumber),
      deviceStatus,
    };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr?.constraint?.includes('username')) {
      throw new Error('username_already_taken');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function dbRequestPasswordReset(input: {
  identifier: string;
  pepper: string;
}) {
  if (!shouldUseLiveDb()) {
    return requestPasswordResetInStore(input);
  }

  const cleanId = input.identifier.trim();
  const normalizedIdx = normalizeUpsaIndexNumber(cleanId);

  const client = await getPgPool().connect();
  try {
    const res = await client.query(
      `SELECT id, email, index_number
       FROM private.profiles
       WHERE lower(username) = lower($1::text)
          OR upper(index_number) = upper($2::text)
          OR lower(email) = lower($1::text)
       LIMIT 1`,
      [cleanId, normalizedIdx]
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('account_not_found');
    }

    const userId = String(row.id);
    const seedHash = hashDeviceToken(`reset:${userId}:${Date.now()}`, input.pepper);
    const numericCode = String((Number.parseInt(seedHash.slice(0, 8), 16) % 900000) + 100000);
    const codeHash = hashDeviceToken(`reset_code:${userId}:${numericCode}`, input.pepper);

    await client.query(
      `INSERT INTO private.password_reset_tokens (user_id, code_hash, expires_at)
       VALUES ($1::uuid, $2::text, now() + interval '15 minutes')
       ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           created_at = now()`,
      [userId, codeHash]
    );

    const maskedTarget = row.index_number
      ? `Index ***${String(row.index_number).slice(-4)}`
      : String(row.email).replace(/(^..).*(@.*$)/, '$1***$2');

    return {
      userId,
      maskedTarget,
      devResetCode: numericCode,
      expiresInMinutes: 15,
    };
  } finally {
    client.release();
  }
}

export async function dbConfirmPasswordReset(input: {
  identifier: string;
  resetCode: string;
  newPassword: string;
  pepper: string;
}) {
  if (!shouldUseLiveDb()) {
    return confirmPasswordResetInStore(input);
  }

  const cleanId = input.identifier.trim();
  const normalizedIdx = normalizeUpsaIndexNumber(cleanId);

  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT p.id, p.username, p.index_number, t.code_hash, t.expires_at
       FROM private.profiles p
       JOIN private.password_reset_tokens t ON t.user_id = p.id
       WHERE (lower(p.username) = lower($1::text)
          OR upper(p.index_number) = upper($2::text)
          OR lower(p.email) = lower($1::text))
         AND t.expires_at > now()
       LIMIT 1`,
      [cleanId, normalizedIdx]
    );

    const row = res.rows[0];
    if (!row) {
      throw new Error('invalid_reset_code');
    }

    const userId = String(row.id);
    const candidateHash = hashDeviceToken(
      `reset_code:${userId}:${input.resetCode.trim()}`,
      input.pepper
    );
    if (candidateHash !== String(row.code_hash)) {
      throw new Error('invalid_reset_code');
    }

    const passwordHash = hashPassword(input.newPassword, input.pepper);
    await client.query(
      `UPDATE private.profiles SET password_hash = $1::text WHERE id = $2::uuid`,
      [passwordHash, userId]
    );
    await client.query(`DELETE FROM private.password_reset_tokens WHERE user_id = $1::uuid`, [
      userId,
    ]);

    await client.query('COMMIT');
    return {
      userId,
      username: row.username ? String(row.username) : null,
      indexNumber: row.index_number ? String(row.index_number) : null,
    };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr?.constraint?.includes('username')) {
      throw new Error('username_already_taken');
    }
    throw err;
  } finally {
    client.release();
  }
}
