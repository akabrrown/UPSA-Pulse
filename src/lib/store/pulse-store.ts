import {
  computeHotScore,
  computeRingBounds,
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_KEYWORD_RULES,
  DEFAULT_UPSA_ZONES,
  hashDeviceToken,
  hashPassword,
  isAllowedEmailDomain,
  type KeywordRuleConfig,
  normalizeUpsaIndexNumber,
  parseGeoJsonPolygonRing,
  screenContentText,
  verifyPassword,
  verifyZonePoint,
  type ZonePolygonConfig,
} from '@/lib/domain/pulse-engine';
import type {
  ContentStatus,
  FeedSort,
  PostKind,
  ReportReason,
  TargetType,
  UserStatus,
} from '@/lib/validation/schemas';

export interface ProfileRecord {
  id: string;
  email: string;
  username?: string | null;
  indexNumber?: string | null;
  passwordHash?: string | null;
  authProvider?: 'password' | 'google' | 'otp';
  indexVerifiedAt?: string | null;
  status: UserStatus;
  statusUntil: string | null;
  karma: number;
  zoneId: number | null;
  zoneVerifiedUntil: string | null;
  isAdmin: boolean;
  canModerate: boolean;
  canUnmask: boolean;
  adultConfirmedAt: string;
  createdAt: string;
  lastSeenOn: string;
}

export interface ChannelRecord {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  allowsAsk: boolean;
  isActive: boolean;
}

export interface PostRecord {
  id: string;
  zoneId: number;
  channelId: number;
  authorId: string | null;
  kind: PostKind;
  body: string;
  status: ContentStatus;
  upvotes: number;
  downvotes: number;
  score: number;
  replyCount: number;
  hotScore: number;
  answeredReplyId: string | null;
  hiddenReason: string | null;
  createdAt: string;
  lastActivityAt: string;
  archivedAt: string | null;
}

export interface ReplyRecord {
  id: string;
  postId: string;
  authorId: string | null;
  aliasNo: number;
  body: string;
  status: ContentStatus;
  upvotes: number;
  downvotes: number;
  score: number;
  createdAt: string;
}

export interface PublicPostView {
  id: string;
  zoneId: number;
  zoneName: string;
  channelId: number;
  kind: PostKind;
  body: string;
  status: ContentStatus;
  score: number;
  hotScore: number;
  replyCount: number;
  answered: boolean;
  answeredReplyId: string | null;
  createdAt: string;
  isMine: boolean;
  myVote: -1 | 0 | 1;
}

export interface PublicReplyView {
  id: string;
  postId: string;
  aliasNo: number;
  body: string;
  score: number;
  createdAt: string;
  isMine: boolean;
  myVote: -1 | 0 | 1;
}

export interface NotificationRecord {
  id: number;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface ReportRecord {
  id: number;
  reporterId: string | null;
  targetType: TargetType;
  targetId: string;
  reason: ReportReason;
  note: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface ModerationActionRecord {
  id: number;
  actorId: string | null;
  targetType: TargetType | null;
  targetUserRef: string | null;
  targetId: string | null;
  action: 'restore' | 'remove' | 'warn' | 'suspend' | 'ban' | 'unban' | 'dismiss_report';
  reason: string;
  createdAt: string;
}

export interface UnmaskRequestRecord {
  id: number;
  postId: string;
  requestedBy: string;
  approvedBy: string | null;
  basis: 'legal_request' | 'credible_threat' | 'upsa_disciplinary_referral';
  reference: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt: string | null;
}

export interface LegalDocumentRecord {
  document: 'terms' | 'privacy' | 'community_guidelines';
  version: string;
  effectiveAt: string;
  changeSummary: string;
  isCurrent: boolean;
}

export interface ConsentRecord {
  id: number;
  userId: string;
  document: string;
  version: string;
  acceptedAt: string;
}

export interface DataRequestRecord {
  id: number;
  userId: string;
  type: 'access' | 'correction';
  details: string;
  status: 'open' | 'in_progress' | 'completed' | 'rejected';
  requestedAt: string;
  dueAt: string;
}

export interface AppealRecord {
  id: number;
  userId: string;
  originalActionId: number;
  message: string;
  status: 'open' | 'upheld' | 'rejected';
  reviewedBy?: string | null;
  decisionNote?: string | null;
  createdAt: string;
  decidedAt?: string | null;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  deviceHash: string;
  status: 'trusted' | 'pending' | 'revoked';
  createdAt: string;
  lastSeenAt: string;
}

interface PulseState {
  zones: ZonePolygonConfig[];
  channels: ChannelRecord[];
  keywordRules: KeywordRuleConfig[];
  allowedDomains: string[];
  legalDocuments: LegalDocumentRecord[];
  profiles: Map<string, ProfileRecord>;
  consents: ConsentRecord[];
  deletionLog: Map<string, string>;
  devices: DeviceRecord[];
  posts: Map<string, PostRecord>;
  replies: Map<string, ReplyRecord>;
  threadAliases: Map<string, Map<string, number>>; // postId -> (userId -> aliasNo)
  votes: Map<string, -1 | 1>; // `${userId}:${targetType}:${targetId}` -> value
  reports: ReportRecord[];
  moderationActions: ModerationActionRecord[];
  unmaskRequests: UnmaskRequestRecord[];
  auditLogs: Array<{ id: number; actorId: string | null; event: string; metadata: Record<string, unknown>; createdAt: string }>;
  notifications: NotificationRecord[];
  pushSubscriptions: Array<{ id: number; userId: string; endpoint: string; p256dh: string; auth: string; createdAt: string }>;
  dataRequests: DataRequestRecord[];
  appeals: AppealRecord[];
  passwordResets: Map<string, { codeHash: string; rawDevCode: string; expiresAt: string }>;
  rateWindows: Map<string, number[]>; // `${userId}:${action}` -> timestamps
  nextSequenceId: number;
}

const DEFAULT_CHANNELS: ChannelRecord[] = [
  {
    id: 1,
    slug: 'academics',
    name: 'Academics',
    description: 'Courses, registration, lecturers (be fair), study tips',
    icon: 'book',
    sortOrder: 1,
    allowsAsk: true,
    isActive: true,
  },
  {
    id: 2,
    slug: 'hostels',
    name: 'Hostels & Housing',
    description: 'Rooms, rent, roommates, safety around campus',
    icon: 'home',
    sortOrder: 2,
    allowsAsk: true,
    isActive: true,
  },
  {
    id: 3,
    slug: 'food',
    name: 'Food & Chop',
    description: 'Where to eat, prices, deals',
    icon: 'utensils',
    sortOrder: 3,
    allowsAsk: true,
    isActive: true,
  },
  {
    id: 4,
    slug: 'lost-found',
    name: 'Lost & Found',
    description: 'Lost something? Found something?',
    icon: 'search',
    sortOrder: 4,
    allowsAsk: false,
    isActive: true,
  },
  {
    id: 5,
    slug: 'events',
    name: 'Events',
    description: 'Programmes, clubs, venue changes',
    icon: 'calendar',
    sortOrder: 5,
    allowsAsk: false,
    isActive: true,
  },
  {
    id: 6,
    slug: 'random',
    name: 'Random',
    description: 'Everything else, within the rules',
    icon: 'chat',
    sortOrder: 6,
    allowsAsk: true,
    isActive: true,
  },
];

const DEFAULT_LEGAL_DOCS: LegalDocumentRecord[] = [
  {
    document: 'terms',
    version: '1.0',
    effectiveAt: '2026-10-17T00:00:00Z',
    changeSummary: 'Initial release of UPSA Pulse Terms of Service.',
    isCurrent: true,
  },
  {
    document: 'privacy',
    version: '1.0',
    effectiveAt: '2026-10-17T00:00:00Z',
    changeSummary: 'Initial release of UPSA Pulse Privacy Notice.',
    isCurrent: true,
  },
  {
    document: 'community_guidelines',
    version: '1.0',
    effectiveAt: '2026-10-17T00:00:00Z',
    changeSummary: 'Initial release of UPSA Pulse Community Guidelines.',
    isCurrent: true,
  },
];

function createInitialState(): PulseState {
  const nowIso = new Date().toISOString();
  const validWindowIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const profiles = new Map<string, ProfileRecord>([
    [
      '11111111-1111-4111-8111-111111111111',
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'efua@st.upsa.edu.gh',
        username: 'efua_upsa',
        indexNumber: '10284001',
        passwordHash: null,
        authProvider: 'password',
        indexVerifiedAt: nowIso,
        status: 'active',
        statusUntil: null,
        karma: 0,
        zoneId: 1,
        zoneVerifiedUntil: validWindowIso,
        isAdmin: false,
        canModerate: false,
        canUnmask: false,
        adultConfirmedAt: nowIso,
        createdAt: nowIso,
        lastSeenOn: nowIso.slice(0, 10),
      },
    ],
    [
      '22222222-2222-4222-8222-222222222222',
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'kojo@st.upsa.edu.gh',
        username: 'kojo_upsa',
        indexNumber: '10284002',
        passwordHash: null,
        authProvider: 'password',
        indexVerifiedAt: nowIso,
        status: 'active',
        statusUntil: null,
        karma: 0,
        zoneId: 1,
        zoneVerifiedUntil: validWindowIso,
        isAdmin: false,
        canModerate: false,
        canUnmask: false,
        adultConfirmedAt: nowIso,
        createdAt: nowIso,
        lastSeenOn: nowIso.slice(0, 10),
      },
    ],
    [
      '33333333-3333-4333-8333-333333333333',
      {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'ama@upsa.edu.gh',
        username: 'ama_upsa',
        indexNumber: '10284003',
        passwordHash: null,
        authProvider: 'password',
        indexVerifiedAt: nowIso,
        status: 'active',
        statusUntil: null,
        karma: 0,
        zoneId: 1,
        zoneVerifiedUntil: validWindowIso,
        isAdmin: false,
        canModerate: false,
        canUnmask: false,
        adultConfirmedAt: nowIso,
        createdAt: nowIso,
        lastSeenOn: nowIso.slice(0, 10),
      },
    ],
    [
      '44444444-4444-4444-8444-444444444444',
      {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'moderator@upsa.edu.gh',
        status: 'active',
        statusUntil: null,
        karma: 0,
        zoneId: 1,
        zoneVerifiedUntil: validWindowIso,
        isAdmin: true,
        canModerate: true,
        canUnmask: false,
        adultConfirmedAt: nowIso,
        createdAt: nowIso,
        lastSeenOn: nowIso.slice(0, 10),
      },
    ],
    [
      '55555555-5555-4555-8555-555555555555',
      {
        id: '55555555-5555-4555-8555-555555555555',
        email: 'holder.a@upsa.edu.gh',
        status: 'active',
        statusUntil: null,
        karma: 0,
        zoneId: 1,
        zoneVerifiedUntil: validWindowIso,
        isAdmin: true,
        canModerate: true,
        canUnmask: true,
        adultConfirmedAt: nowIso,
        createdAt: nowIso,
        lastSeenOn: nowIso.slice(0, 10),
      },
    ],
    [
      '66666666-6666-4666-8666-666666666666',
      {
        id: '66666666-6666-4666-8666-666666666666',
        email: 'holder.b@upsa.edu.gh',
        status: 'active',
        statusUntil: null,
        karma: 0,
        zoneId: 1,
        zoneVerifiedUntil: validWindowIso,
        isAdmin: true,
        canModerate: true,
        canUnmask: true,
        adultConfirmedAt: nowIso,
        createdAt: nowIso,
        lastSeenOn: nowIso.slice(0, 10),
      },
    ],
  ]);

  const posts = new Map<string, PostRecord>();
  const replies = new Map<string, ReplyRecord>();
  const threadAliases = new Map<string, Map<string, number>>();

  return {
    zones: DEFAULT_UPSA_ZONES.map((z) => ({
      ...z,
      coordinates: z.coordinates ? z.coordinates.map((pt) => [pt[0], pt[1]] as [number, number]) : undefined,
    })),
    channels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
    keywordRules: DEFAULT_KEYWORD_RULES.map((r) => ({ ...r })),
    allowedDomains: [...DEFAULT_ALLOWED_DOMAINS],
    legalDocuments: DEFAULT_LEGAL_DOCS.map((d) => ({ ...d })),
    profiles,
    consents: [
      {
        id: 1,
        userId: '11111111-1111-4111-8111-111111111111',
        document: 'terms',
        version: '1.0',
        acceptedAt: nowIso,
      },
      {
        id: 2,
        userId: '11111111-1111-4111-8111-111111111111',
        document: 'privacy',
        version: '1.0',
        acceptedAt: nowIso,
      },
      {
        id: 3,
        userId: '11111111-1111-4111-8111-111111111111',
        document: 'community_guidelines',
        version: '1.0',
        acceptedAt: nowIso,
      },
    ],
    deletionLog: new Map(),
    devices: [],
    posts,
    replies,
    threadAliases,
    votes: new Map(),
    reports: [],
    moderationActions: [],
    unmaskRequests: [],
    auditLogs: [],
    notifications: [],
    pushSubscriptions: [],
    dataRequests: [],
    appeals: [],
    passwordResets: new Map(),
    rateWindows: new Map(),
    nextSequenceId: 100,
  };
}

let state: PulseState = createInitialState();

export const DEFAULT_DEMO_USER_ID = '11111111-1111-4111-8111-111111111111';

export function resetPulseStoreForTests(): void {
  state = createInitialState();
}

function nextId(): number {
  state.nextSequenceId += 1;
  return state.nextSequenceId;
}

function checkRateLimit(userId: string, action: 'post' | 'reply' | 'otp', limitPerHour: number): void {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recent = (state.rateWindows.get(key) ?? []).filter((ts) => ts > oneHourAgo);
  if (recent.length >= limitPerHour) {
    throw new Error('rate_limited');
  }
  recent.push(now);
  state.rateWindows.set(key, recent);
}

function requireActiveZoneUser(userId: string): ProfileRecord {
  if (!userId) {
    throw new Error('forbidden');
  }
  const profile = state.profiles.get(userId);
  if (!profile) {
    throw new Error('zone_not_verified');
  }
  if (profile.status !== 'active') {
    throw new Error(`account_${profile.status}`);
  }
  if (
    !profile.zoneId ||
    !profile.zoneVerifiedUntil ||
    new Date(profile.zoneVerifiedUntil).getTime() <= Date.now()
  ) {
    throw new Error('zone_not_verified');
  }
  return profile;
}

function toPublicPostView(post: PostRecord, viewerUserId: string): PublicPostView {
  const voteKey = `${viewerUserId}:post:${post.id}`;
  const myVote = state.votes.get(voteKey) ?? 0;
  const zoneName = state.zones.find((z) => z.id === post.zoneId)?.name ?? 'UPSA Main Campus';
  return {
    id: post.id,
    zoneId: post.zoneId,
    zoneName,
    channelId: post.channelId,
    kind: post.kind,
    body: post.body,
    status: post.status,
    score: post.score,
    hotScore: post.hotScore,
    replyCount: post.replyCount,
    answered: post.answeredReplyId !== null,
    answeredReplyId: post.answeredReplyId,
    createdAt: post.createdAt,
    isMine: post.authorId !== null && post.authorId === viewerUserId,
    myVote,
  };
}

function toPublicReplyView(reply: ReplyRecord, viewerUserId: string): PublicReplyView {
  const voteKey = `${viewerUserId}:reply:${reply.id}`;
  const myVote = state.votes.get(voteKey) ?? 0;
  return {
    id: reply.id,
    postId: reply.postId,
    aliasNo: reply.aliasNo,
    body: reply.body,
    score: reply.score,
    createdAt: reply.createdAt,
    isMine: reply.authorId !== null && reply.authorId === viewerUserId,
    myVote,
  };
}

export function verifyUserZoneInStore(
  userId: string,
  reading: { lat: number; lng: number; accuracy: number }
) {
  let profile = state.profiles.get(userId);
  if (!profile) {
    const nowIso = new Date().toISOString();
    profile = {
      id: userId,
      email: 'student@st.upsa.edu.gh',
      status: 'active',
      statusUntil: null,
      karma: 0,
      zoneId: null,
      zoneVerifiedUntil: null,
      isAdmin: false,
      canModerate: false,
      canUnmask: false,
      adultConfirmedAt: nowIso,
      createdAt: nowIso,
      lastSeenOn: nowIso.slice(0, 10),
    };
    state.profiles.set(userId, profile);
  }

  const check = verifyZonePoint(reading, state.zones);
  if (check.verified && check.zoneId && check.verifiedUntil) {
    profile.zoneId = check.zoneId;
    profile.zoneVerifiedUntil = check.verifiedUntil;
    profile.lastSeenOn = new Date().toISOString().slice(0, 10);
  }
  return check;
}

export function getChannelsFromStore(): ChannelRecord[] {
  return state.channels
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ ...c }));
}

export function getZonesFromStore(): ZonePolygonConfig[] {
  return state.zones
    .filter((z) => z.isActive)
    .map((z) => ({
      ...z,
      coordinates: z.coordinates ? z.coordinates.map((pt) => [pt[0], pt[1]] as [number, number]) : undefined,
    }));
}

export function getFeedFromStore(params: {
  userId: string;
  sort?: FeedSort;
  channelId?: number;
  zoneId?: number;
  kind?: PostKind;
  limit?: number;
}): {
  items: PublicPostView[];
  nextCursor: string | null;
  zoneName: string;
  zones: ZonePolygonConfig[];
} {
  const profile = requireActiveZoneUser(params.userId);
  const sort = params.sort ?? 'hot';
  const limit = Math.min(params.limit ?? 20, 50);
  const now = new Date();
  const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const activeZoneIds = new Set(state.zones.filter((z) => z.isActive).map((z) => z.id));

  const published = Array.from(state.posts.values()).filter((p) => {
    if (!activeZoneIds.has(p.zoneId)) return false;
    if (params.zoneId !== undefined && p.zoneId !== params.zoneId) return false;
    if (p.status !== 'published') return false;
    if (params.channelId !== undefined && p.channelId !== params.channelId) return false;
    if (params.kind !== undefined && p.kind !== params.kind) return false;
    if (sort === 'top24' && new Date(p.createdAt).getTime() < twentyFourHoursAgo) return false;
    return true;
  });

  for (const post of published) {
    post.hotScore = computeHotScore(post.score, new Date(post.createdAt), now);
  }

  published.sort((a, b) => {
    if (sort === 'new') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sort === 'top24') {
      return b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return b.hotScore - a.hotScore || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const sliced = published.slice(0, limit);
  const selectedZone =
    params.zoneId !== undefined
      ? state.zones.find((z) => z.id === params.zoneId)
      : state.zones.find((z) => z.id === profile.zoneId);
  const zoneName =
    params.zoneId !== undefined
      ? selectedZone?.name ?? 'UPSA Main Campus'
      : selectedZone?.name ?? 'All UPSA Places';

  return {
    items: sliced.map((p) => toPublicPostView(p, params.userId)),
    nextCursor: sliced.length === limit ? sliced[sliced.length - 1]?.id ?? null : null,
    zoneName,
    zones: getZonesFromStore(),
  };
}

export function createPostInStore(
  userId: string,
  input: { zoneId?: number; channelId: number; kind: PostKind; body: string }
): PublicPostView & { showSupportCard: boolean } {
  const profile = requireActiveZoneUser(userId);
  // POST-4: Rate limits per user, starting at 10 posts per hour
  checkRateLimit(userId, 'post', 10);

  const channel = state.channels.find((c) => c.id === input.channelId && c.isActive);
  if (!channel || (input.kind === 'ask' && !channel.allowsAsk)) {
    throw new Error('invalid_channel');
  }

  const targetZoneId =
    input.zoneId !== undefined && state.zones.some((z) => z.id === input.zoneId && z.isActive)
      ? input.zoneId
      : profile.zoneId!;

  const trimmed = input.body.trim();
  const screen = screenContentText(trimmed, state.keywordRules);
  const now = new Date();
  const id = crypto.randomUUID();

  const post: PostRecord = {
    id,
    zoneId: targetZoneId,
    channelId: channel.id,
    authorId: userId,
    kind: input.kind,
    body: trimmed,
    status: screen.status,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    replyCount: 0,
    hotScore: computeHotScore(0, now, now),
    answeredReplyId: null,
    hiddenReason: screen.category,
    createdAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    archivedAt: null,
  };

  state.posts.set(id, post);
  state.threadAliases.set(id, new Map([[userId, 0]])); // OP = 0

  return {
    ...toPublicPostView(post, userId),
    showSupportCard: screen.showSupportCard,
  };
}

export function getThreadFromStore(
  userId: string,
  postId: string
): { post: PublicPostView; replies: PublicReplyView[] } {
  requireActiveZoneUser(userId);
  const post = state.posts.get(postId);
  const isZoneActive = post ? state.zones.some((z) => z.id === post.zoneId && z.isActive) : false;

  if (
    !post ||
    !isZoneActive ||
    !(post.status === 'published' || (post.authorId === userId && (post.status === 'held' || post.status === 'hidden')))
  ) {
    throw new Error('post_unavailable');
  }

  const replies = Array.from(state.replies.values())
    .filter((r) => r.postId === postId && r.status === 'published')
    .sort((a, b) => {
      const aPinned = post.answeredReplyId === a.id ? 1 : 0;
      const bPinned = post.answeredReplyId === b.id ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map((r) => toPublicReplyView(r, userId));

  return {
    post: toPublicPostView(post, userId),
    replies,
  };
}

export function createReplyInStore(
  userId: string,
  postId: string,
  body: string
): PublicReplyView & { status: ContentStatus; showSupportCard: boolean } {
  requireActiveZoneUser(userId);
  // POST-4: 30 replies per hour
  checkRateLimit(userId, 'reply', 30);

  const post = state.posts.get(postId);
  const isZoneActive = post ? state.zones.some((z) => z.id === post.zoneId && z.isActive) : false;
  if (!post || !isZoneActive || post.status !== 'published') {
    throw new Error('post_unavailable');
  }

  let aliasMap = state.threadAliases.get(postId);
  if (!aliasMap) {
    aliasMap = new Map();
    if (post.authorId) {
      aliasMap.set(post.authorId, 0);
    }
    state.threadAliases.set(postId, aliasMap);
  }

  let aliasNo = aliasMap.get(userId);
  if (aliasNo === undefined) {
    if (post.authorId === userId) {
      aliasNo = 0;
    } else {
      let maxAlias = 0;
      for (const val of aliasMap.values()) {
        if (val > maxAlias) maxAlias = val;
      }
      aliasNo = maxAlias + 1;
    }
    aliasMap.set(userId, aliasNo);
  }

  const trimmed = body.trim();
  const screen = screenContentText(trimmed, state.keywordRules);
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();

  const reply: ReplyRecord = {
    id,
    postId,
    authorId: userId,
    aliasNo,
    body: trimmed,
    status: screen.status,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    createdAt: nowIso,
  };

  state.replies.set(id, reply);

  if (screen.status === 'published') {
    post.replyCount = Array.from(state.replies.values()).filter(
      (r) => r.postId === postId && r.status === 'published'
    ).length;
    post.lastActivityAt = nowIso;

    if (post.authorId && post.authorId !== userId) {
      state.notifications.unshift({
        id: nextId(),
        userId: post.authorId,
        type: 'reply',
        payload: {
          post_id: postId,
          reply_id: id,
          alias_no: aliasNo,
          snippet: trimmed.slice(0, 80),
        },
        readAt: null,
        createdAt: nowIso,
      });
    }
  }

  return {
    ...toPublicReplyView(reply, userId),
    status: reply.status,
    showSupportCard: screen.showSupportCard,
  };
}

export function deleteOwnPostInStore(userId: string, postId: string): void {
  const post = state.posts.get(postId);
  if (!post || post.authorId !== userId) {
    throw new Error('forbidden');
  }
  post.status = 'removed';
}

export function markAnswerInStore(userId: string, replyId: string): void {
  const reply = state.replies.get(replyId);
  if (!reply || reply.status !== 'published') {
    throw new Error('target_unavailable');
  }
  const post = state.posts.get(reply.postId);
  if (!post || post.status !== 'published') {
    throw new Error('target_unavailable');
  }
  if (post.authorId !== userId) {
    throw new Error('forbidden');
  }
  if (post.kind !== 'ask') {
    throw new Error('not_an_ask');
  }

  post.answeredReplyId = reply.id;

  if (reply.authorId && reply.authorId !== userId) {
    state.notifications.unshift({
      id: nextId(),
      userId: reply.authorId,
      type: 'answer_accepted',
      payload: {
        post_id: post.id,
        reply_id: reply.id,
      },
      readAt: null,
      createdAt: new Date().toISOString(),
    });
  }
}

export function castVoteInStore(
  userId: string,
  input: { targetType: TargetType; targetId: string; value: -1 | 0 | 1 }
): { score: number; myVote: -1 | 0 | 1; hidden: boolean } {
  requireActiveZoneUser(userId);
  const voteKey = `${userId}:${input.targetType}:${input.targetId}`;
  const prevVote = state.votes.get(voteKey) ?? 0;

  let targetAuthorId: string | null = null;
  let targetPost: PostRecord | undefined;
  let targetReply: ReplyRecord | undefined;

  if (input.targetType === 'post') {
    const post = state.posts.get(input.targetId);
    const isZoneActive = post ? state.zones.some((z) => z.id === post.zoneId && z.isActive) : false;
    if (!post || !isZoneActive || post.status !== 'published') {
      throw new Error('target_unavailable');
    }
    targetAuthorId = post.authorId;
    targetPost = post;
  } else {
    const reply = state.replies.get(input.targetId);
    const parentPost = reply ? state.posts.get(reply.postId) : undefined;
    const isZoneActive = parentPost
      ? state.zones.some((z) => z.id === parentPost.zoneId && z.isActive)
      : false;
    if (!reply || !parentPost || !isZoneActive || reply.status !== 'published') {
      throw new Error('target_unavailable');
    }
    targetAuthorId = reply.authorId;
    targetReply = reply;
  }

  if (targetAuthorId === userId) {
    throw new Error('own_content');
  }

  let du = 0;
  let dd = 0;
  if (prevVote === 1) du -= 1;
  if (prevVote === -1) dd -= 1;
  if (input.value === 1) du += 1;
  if (input.value === -1) dd += 1;

  if (input.value === 0) {
    state.votes.delete(voteKey);
  } else {
    state.votes.set(voteKey, input.value);
  }

  if (targetAuthorId) {
    const authorProfile = state.profiles.get(targetAuthorId);
    if (authorProfile) {
      authorProfile.karma += du - dd;
    }
  }

  if (targetPost) {
    targetPost.upvotes = Math.max(0, targetPost.upvotes + du);
    targetPost.downvotes = Math.max(0, targetPost.downvotes + dd);
    targetPost.score = targetPost.upvotes - targetPost.downvotes;
    targetPost.hotScore = computeHotScore(targetPost.score, new Date(targetPost.createdAt));
    // VOTE-2: Net score reaches -5 -> hidden and queued for review
    if (targetPost.status === 'published' && targetPost.score <= -5) {
      targetPost.status = 'hidden';
      targetPost.hiddenReason = 'score';
    }
    return {
      score: targetPost.score,
      myVote: input.value,
      hidden: targetPost.status === 'hidden',
    };
  }

  targetReply!.upvotes = Math.max(0, targetReply!.upvotes + du);
  targetReply!.downvotes = Math.max(0, targetReply!.downvotes + dd);
  targetReply!.score = targetReply!.upvotes - targetReply!.downvotes;
  return {
    score: targetReply!.score,
    myVote: input.value,
    hidden: false,
  };
}

export function reportContentInStore(
  userId: string,
  input: { targetType: TargetType; targetId: string; reason: ReportReason; note?: string }
): { autoHidden: boolean; showSupportCard: boolean } {
  const existing = state.reports.find(
    (r) =>
      r.reporterId === userId &&
      r.targetType === input.targetType &&
      r.targetId === input.targetId
  );

  if (!existing) {
    state.reports.push({
      id: nextId(),
      reporterId: userId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      note: input.note ? input.note.slice(0, 300) : null,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedBy: null,
      resolvedAt: null,
    });
  }

  const openReports = state.reports.filter(
    (r) =>
      r.targetType === input.targetType &&
      r.targetId === input.targetId &&
      r.status === 'open'
  );
  const distinctAll = new Set(openReports.map((r) => r.reporterId)).size;
  const distinctPriority = new Set(
    openReports
      .filter((r) =>
        r.reason === 'self_harm' || r.reason === 'threat_of_violence' || r.reason === 'doxxing'
      )
      .map((r) => r.reporterId)
  ).size;

  let autoHidden = false;
  if (distinctPriority >= 2 || distinctAll >= 5) {
    if (input.targetType === 'post') {
      const post = state.posts.get(input.targetId);
      if (post && post.status === 'published') {
        post.status = 'hidden';
        post.hiddenReason = 'reports';
        autoHidden = true;
      }
    } else {
      const reply = state.replies.get(input.targetId);
      if (reply && reply.status === 'published') {
        reply.status = 'hidden';
        autoHidden = true;
      }
    }
  }

  return {
    autoHidden,
    showSupportCard: input.reason === 'self_harm',
  };
}

export function getModerationQueueFromStore(actorUserId: string) {
  const actor = state.profiles.get(actorUserId);
  if (!actor || (!actor.isAdmin && !actor.canModerate)) {
    throw new Error('forbidden');
  }

  const priorityReasons = new Set<ReportReason>(['self_harm', 'threat_of_violence', 'doxxing']);

  const postItems = Array.from(state.posts.values())
    .filter((p) => {
      const hasOpenReport = state.reports.some(
        (r) => r.targetType === 'post' && r.targetId === p.id && r.status === 'open'
      );
      return p.status === 'held' || p.status === 'hidden' || hasOpenReport;
    })
    .map((p) => {
      const openReports = state.reports.filter(
        (r) => r.targetType === 'post' && r.targetId === p.id && r.status === 'open'
      );
      const isPriority =
        p.hiddenReason === 'self_harm' ||
        p.hiddenReason === 'phone_number_doxxing' ||
        openReports.some((r) => priorityReasons.has(r.reason));
      const participated = state.threadAliases.get(p.id)?.has(actorUserId) ?? false;

      return {
        targetType: 'post' as const,
        targetId: p.id,
        postId: p.id,
        channelId: p.channelId,
        aliasLabel: 'OP',
        body: p.body,
        status: p.status,
        hiddenReason: p.hiddenReason,
        reportCount: openReports.length,
        reportReasons: Array.from(new Set(openReports.map((r) => r.reason))),
        priority: isPriority ? ('P1' as const) : ('P2' as const),
        createdAt: p.createdAt,
        conflictOfInterest: participated,
      };
    });

  return postItems.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'P1' ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function applyModerationActionInStore(
  actorUserId: string,
  input: {
    targetType: TargetType;
    targetId: string;
    action: 'restore' | 'remove' | 'warn' | 'suspend' | 'ban' | 'unban' | 'dismiss_report';
    reason: string;
    suspendDays?: 1 | 7 | 30;
  }
) {
  const actor = state.profiles.get(actorUserId);
  if (!actor || (!actor.isAdmin && !actor.canModerate)) {
    throw new Error('forbidden');
  }
  const cleanReason = input.reason.trim();
  if (cleanReason.length < 5) {
    throw new Error('reason_too_short');
  }

  let postId: string | undefined;
  let targetAuthorId: string | null = null;

  if (input.targetType === 'post') {
    const post = state.posts.get(input.targetId);
    if (!post) throw new Error('target_unavailable');
    postId = post.id;
    targetAuthorId = post.authorId;
  } else {
    const reply = state.replies.get(input.targetId);
    if (!reply) throw new Error('target_unavailable');
    postId = reply.postId;
    targetAuthorId = reply.authorId;
  }

  // App Flow Section 6: Moderator cannot moderate content from threads they participated in
  const aliasMap = state.threadAliases.get(postId);
  if (aliasMap?.has(actorUserId)) {
    throw new Error('conflict_of_interest');
  }

  const nowIso = new Date().toISOString();

  if (input.action === 'restore') {
    if (input.targetType === 'post') {
      const post = state.posts.get(input.targetId)!;
      post.status = 'published';
      post.hiddenReason = null;
    } else {
      const reply = state.replies.get(input.targetId)!;
      reply.status = 'published';
    }
    for (const r of state.reports) {
      if (r.targetType === input.targetType && r.targetId === input.targetId && r.status === 'open') {
        r.status = 'dismissed';
        r.resolvedBy = actorUserId;
        r.resolvedAt = nowIso;
      }
    }
  } else if (input.action === 'remove') {
    if (input.targetType === 'post') {
      state.posts.get(input.targetId)!.status = 'removed';
    } else {
      state.replies.get(input.targetId)!.status = 'removed';
    }
    for (const r of state.reports) {
      if (r.targetType === input.targetType && r.targetId === input.targetId && r.status === 'open') {
        r.status = 'actioned';
        r.resolvedBy = actorUserId;
        r.resolvedAt = nowIso;
      }
    }
  } else if (input.action === 'suspend' && targetAuthorId) {
    const author = state.profiles.get(targetAuthorId);
    if (author) {
      const days = input.suspendDays ?? 7;
      author.status = 'suspended';
      author.statusUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }
  } else if (input.action === 'ban' && targetAuthorId) {
    if (!actor.isAdmin) throw new Error('forbidden');
    const author = state.profiles.get(targetAuthorId);
    if (author) {
      author.status = 'banned';
      author.statusUntil = null;
    }
  }

  const record: ModerationActionRecord = {
    id: nextId(),
    actorId: actorUserId,
    targetType: input.targetType,
    targetUserRef: targetAuthorId,
    targetId: input.targetId,
    action: input.action,
    reason: cleanReason,
    createdAt: nowIso,
  };
  state.moderationActions.push(record);

  if (targetAuthorId) {
    state.notifications.unshift({
      id: nextId(),
      userId: targetAuthorId,
      type: 'moderation_outcome',
      payload: {
        action: input.action,
        target_type: input.targetType,
        category: cleanReason,
      },
      readAt: null,
      createdAt: nowIso,
    });
  }

  return record;
}

export function getMyProfileSummaryFromStore(userId: string) {
  const profile = state.profiles.get(userId);
  if (!profile) {
    throw new Error('forbidden');
  }
  const currentDocs = state.legalDocuments.filter((d) => d.isCurrent);
  const userConsents = state.consents.filter((c) => c.userId === userId);
  const requiresReacceptance = currentDocs.filter(
    (doc) => !userConsents.some((c) => c.document === doc.document && c.version === doc.version)
  );

  return {
    username: profile.username ?? null,
    indexNumber: profile.indexNumber ?? null,
    authProvider: profile.authProvider ?? 'otp',
    indexVerified: Boolean(profile.indexVerifiedAt),
    status: profile.status,
    statusUntil: profile.statusUntil,
    karma: profile.karma,
    zoneId: profile.zoneId,
    zoneVerifiedUntil: profile.zoneVerifiedUntil,
    isAdmin: profile.isAdmin,
    canModerate: profile.canModerate,
    canUnmask: profile.canUnmask,
    createdAt: profile.createdAt,
    pendingLegalUpdates: requiresReacceptance,
  };
}

export function getNotificationsFromStore(userId: string): NotificationRecord[] {
  return state.notifications
    .filter((n) => n.userId === userId)
    .slice(0, 50)
    .map((n) => ({ ...n }));
}

export function markNotificationsReadInStore(userId: string): void {
  const nowIso = new Date().toISOString();
  for (const n of state.notifications) {
    if (n.userId === userId && !n.readAt) {
      n.readAt = nowIso;
    }
  }
}

export function recordConsentInStore(
  userId: string,
  input: { document: 'terms' | 'privacy' | 'community_guidelines'; version: string }
): ConsentRecord {
  const docExists = state.legalDocuments.some(
    (d) => d.document === input.document && d.version === input.version
  );
  if (!docExists) {
    throw new Error('invalid_document_version');
  }
  const existing = state.consents.find(
    (c) => c.userId === userId && c.document === input.document && c.version === input.version
  );
  if (existing) return existing;

  const record: ConsentRecord = {
    id: nextId(),
    userId,
    document: input.document,
    version: input.version,
    acceptedAt: new Date().toISOString(),
  };
  state.consents.push(record);
  return record;
}

export function createDataRequestInStore(
  userId: string,
  input: { type: 'access' | 'correction'; details: string }
): DataRequestRecord {
  const now = new Date();
  const due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const req: DataRequestRecord = {
    id: nextId(),
    userId,
    type: input.type,
    details: input.details.trim().slice(0, 1000),
    status: 'open',
    requestedAt: now.toISOString(),
    dueAt: due.toISOString(),
  };
  state.dataRequests.push(req);
  state.notifications.unshift({
    id: nextId(),
    userId,
    type: 'data_request_status',
    payload: {
      request_id: req.id,
      status: 'open',
      due_at: req.dueAt,
    },
    readAt: null,
    createdAt: now.toISOString(),
  });
  return req;
}

export function deleteAccountInStore(
  userId: string,
  input: { confirmationText: string; otp: string }
): { deletedAt: string } {
  if (input.confirmationText !== 'DELETE' || !/^\d{6}$/.test(input.otp)) {
    throw new Error('invalid_confirmation');
  }

  const profile = state.profiles.get(userId);
  if (!profile) {
    throw new Error('forbidden');
  }

  // ACCT-1 & F12: Null author_id on posts and replies so threads remain coherent with no link to the user
  for (const post of state.posts.values()) {
    if (post.authorId === userId) {
      post.authorId = null;
    }
  }
  for (const reply of state.replies.values()) {
    if (reply.authorId === userId) {
      reply.authorId = null;
    }
  }
  for (const aliasMap of state.threadAliases.values()) {
    aliasMap.delete(userId);
  }

  // Remove user votes and adjust counts
  for (const [key, val] of Array.from(state.votes.entries())) {
    if (key.startsWith(`${userId}:`)) {
      const [, targetType, targetId] = key.split(':');
      if (targetType === 'post' && targetId) {
        const post = state.posts.get(targetId);
        if (post) {
          if (val === 1) post.upvotes = Math.max(0, post.upvotes - 1);
          if (val === -1) post.downvotes = Math.max(0, post.downvotes - 1);
          post.score = post.upvotes - post.downvotes;
        }
      } else if (targetType === 'reply' && targetId) {
        const reply = state.replies.get(targetId);
        if (reply) {
          if (val === 1) reply.upvotes = Math.max(0, reply.upvotes - 1);
          if (val === -1) reply.downvotes = Math.max(0, reply.downvotes - 1);
          reply.score = reply.upvotes - reply.downvotes;
        }
      }
      state.votes.delete(key);
    }
  }

  state.devices = state.devices.filter((d) => d.userId !== userId);
  state.notifications = state.notifications.filter((n) => n.userId !== userId);
  state.pushSubscriptions = state.pushSubscriptions.filter((s) => s.userId !== userId);
  state.profiles.delete(userId);

  const deletedAt = new Date().toISOString();
  state.deletionLog.set(userId, deletedAt);

  return { deletedAt };
}

export function savePushSubscriptionInStore(
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string }
) {
  const existing = state.pushSubscriptions.find((s) => s.endpoint === sub.endpoint);
  if (existing) {
    existing.userId = userId;
    existing.p256dh = sub.p256dh;
    existing.auth = sub.auth;
    return existing;
  }
  const created = {
    id: nextId(),
    userId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    createdAt: new Date().toISOString(),
  };
  state.pushSubscriptions.push(created);
  return created;
}

export function removePushSubscriptionInStore(userId: string, endpoint: string): void {
  state.pushSubscriptions = state.pushSubscriptions.filter(
    (s) => !(s.userId === userId && s.endpoint === endpoint)
  );
}

export function getAdminConfigFromStore(actorUserId: string) {
  const actor = state.profiles.get(actorUserId);
  if (!actor || !actor.isAdmin) {
    throw new Error('forbidden');
  }
  return {
    zones: state.zones,
    channels: state.channels,
    keywordRules: state.keywordRules,
    allowedDomains: state.allowedDomains,
    legalDocuments: state.legalDocuments,
    auditLogCount: state.auditLogs.length,
  };
}

export function updateAdminConfigInStore(
  actorUserId: string,
  input: { section: 'zone' | 'channel' | 'keyword_rule' | 'allowed_domain'; payload: Record<string, unknown> }
) {
  const actor = state.profiles.get(actorUserId);
  if (!actor || !actor.isAdmin) {
    throw new Error('forbidden');
  }

  if (input.section === 'allowed_domain' && typeof input.payload.domain === 'string') {
    const domain = input.payload.domain.trim().toLowerCase();
    if (!state.allowedDomains.includes(domain)) {
      state.allowedDomains.push(domain);
    }
  } else if (
    input.section === 'keyword_rule' &&
    typeof input.payload.pattern === 'string' &&
    (input.payload.matchType === 'contains' || input.payload.matchType === 'regex') &&
    typeof input.payload.category === 'string'
  ) {
    state.keywordRules.push({
      id: nextId(),
      pattern: input.payload.pattern,
      matchType: input.payload.matchType,
      category: input.payload.category,
      isActive: true,
    });
  } else if (input.section === 'zone') {
    const parsedRing =
      input.payload.geojson !== undefined ? parseGeoJsonPolygonRing(input.payload.geojson) : null;

    if (typeof input.payload.id === 'number') {
      const existingZone = state.zones.find((z) => z.id === input.payload.id);
      if (existingZone) {
        if (typeof input.payload.name === 'string' && input.payload.name.trim()) {
          existingZone.name = input.payload.name.trim();
        }
        if (typeof input.payload.maxAccuracyMeters === 'number') {
          existingZone.maxAccuracyMeters = input.payload.maxAccuracyMeters;
        }
        if (typeof input.payload.isActive === 'boolean') {
          existingZone.isActive = input.payload.isActive;
        }
        if (parsedRing) {
          const bounds = computeRingBounds(parsedRing);
          existingZone.minLat = bounds.minLat;
          existingZone.maxLat = bounds.maxLat;
          existingZone.minLng = bounds.minLng;
          existingZone.maxLng = bounds.maxLng;
          existingZone.coordinates = parsedRing;
        }
      }
    } else if (typeof input.payload.name === 'string' && input.payload.name.trim()) {
      const cleanName = input.payload.name.trim();
      const maxAcc =
        typeof input.payload.maxAccuracyMeters === 'number'
          ? input.payload.maxAccuracyMeters
          : 150;
      const existingByName = state.zones.find(
        (z) => z.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (existingByName) {
        existingByName.maxAccuracyMeters = maxAcc;
        if (typeof input.payload.isActive === 'boolean') {
          existingByName.isActive = input.payload.isActive;
        }
        if (parsedRing) {
          const bounds = computeRingBounds(parsedRing);
          existingByName.minLat = bounds.minLat;
          existingByName.maxLat = bounds.maxLat;
          existingByName.minLng = bounds.minLng;
          existingByName.maxLng = bounds.maxLng;
          existingByName.coordinates = parsedRing;
        }
      } else {
        const nextZoneId = state.zones.reduce((m, z) => Math.max(m, z.id), 0) + 1;
        const bounds = parsedRing
          ? computeRingBounds(parsedRing)
          : {
              minLat: Number(input.payload.minLat ?? 5.656),
              maxLat: Number(input.payload.maxLat ?? 5.664),
              minLng: Number(input.payload.minLng ?? -0.172),
              maxLng: Number(input.payload.maxLng ?? -0.164),
            };
        state.zones.push({
          id: nextZoneId,
          name: cleanName,
          ...bounds,
          maxAccuracyMeters: maxAcc,
          isActive: typeof input.payload.isActive === 'boolean' ? input.payload.isActive : true,
          coordinates: parsedRing ?? undefined,
        });
      }
    } else if (typeof input.payload.maxAccuracyMeters === 'number') {
      for (const z of state.zones) {
        z.maxAccuracyMeters = input.payload.maxAccuracyMeters;
      }
    }
  } else if (input.section === 'channel') {
    if (typeof input.payload.id === 'number') {
      const ch = state.channels.find((c) => c.id === input.payload.id);
      if (ch) {
        if (typeof input.payload.isActive === 'boolean') ch.isActive = input.payload.isActive;
        if (typeof input.payload.allowsAsk === 'boolean') ch.allowsAsk = input.payload.allowsAsk;
        if (typeof input.payload.name === 'string' && input.payload.name.trim()) {
          ch.name = input.payload.name.trim();
        }
        if (typeof input.payload.description === 'string') {
          ch.description = input.payload.description.trim();
        }
        if (typeof input.payload.icon === 'string' && input.payload.icon.trim()) {
          ch.icon = input.payload.icon.trim();
        }
        if (typeof input.payload.sortOrder === 'number') {
          ch.sortOrder = input.payload.sortOrder;
        }
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
      const existing = state.channels.find((c) => c.slug.toLowerCase() === slug);
      if (existing) {
        existing.name = cleanName;
        if (typeof input.payload.description === 'string') {
          existing.description = input.payload.description.trim();
        }
        if (typeof input.payload.icon === 'string') {
          existing.icon = input.payload.icon.trim();
        }
        if (typeof input.payload.allowsAsk === 'boolean') {
          existing.allowsAsk = input.payload.allowsAsk;
        }
        if (typeof input.payload.isActive === 'boolean') {
          existing.isActive = input.payload.isActive;
        }
      } else {
        const nextSort =
          typeof input.payload.sortOrder === 'number'
            ? input.payload.sortOrder
            : state.channels.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
        const nextChanId = state.channels.reduce((m, c) => Math.max(m, c.id), 0) + 1;
        state.channels.push({
          id: nextChanId,
          slug,
          name: cleanName,
          description:
            typeof input.payload.description === 'string'
              ? input.payload.description.trim()
              : '',
          icon:
            typeof input.payload.icon === 'string' && input.payload.icon.trim()
              ? input.payload.icon.trim()
              : 'chat',
          sortOrder: nextSort,
          allowsAsk:
            typeof input.payload.allowsAsk === 'boolean' ? input.payload.allowsAsk : true,
          isActive: typeof input.payload.isActive === 'boolean' ? input.payload.isActive : true,
        });
      }
    }
    state.channels.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  state.auditLogs.push({
    id: nextId(),
    actorId: actorUserId,
    event: `admin_config_update:${input.section}`,
    metadata: input.payload,
    createdAt: new Date().toISOString(),
  });

  return getAdminConfigFromStore(actorUserId);
}

export function executeUnmaskActionInStore(
  actorUserId: string,
  input:
    | {
        action: 'request';
        postId: string;
        basis: 'legal_request' | 'credible_threat' | 'upsa_disciplinary_referral';
        reference: string;
        reason: string;
      }
    | {
        action: 'approve';
        requestId: number;
      }
    | {
        action: 'reject';
        requestId: number;
        reason: string;
      },
  options: { policyEnabled: boolean } = { policyEnabled: false }
): {
  requestId?: number;
  status: 'pending' | 'approved' | 'rejected';
  disclosedIdentity?: { userId: string; email: string } | null;
} {
  if (!options.policyEnabled) {
    throw new Error('unmask_disabled_by_policy');
  }

  const actor = state.profiles.get(actorUserId);
  if (!actor || !actor.canUnmask) {
    throw new Error('forbidden');
  }

  const nowIso = new Date().toISOString();

  if (input.action === 'request') {
    const req: UnmaskRequestRecord = {
      id: nextId(),
      postId: input.postId,
      requestedBy: actorUserId,
      approvedBy: null,
      basis: input.basis,
      reference: input.reference,
      reason: input.reason,
      status: 'pending',
      createdAt: nowIso,
      decidedAt: null,
    };
    state.unmaskRequests.push(req);
    state.auditLogs.push({
      id: nextId(),
      actorId: actorUserId,
      event: 'unmask_requested',
      metadata: { requestId: req.id, postId: input.postId, basis: input.basis, reference: input.reference },
      createdAt: nowIso,
    });
    return { requestId: req.id, status: 'pending' };
  }

  const req = state.unmaskRequests.find((r) => r.id === input.requestId);
  if (!req || req.status !== 'pending') {
    throw new Error('target_unavailable');
  }

  if (req.requestedBy === actorUserId) {
    throw new Error('two_person_rule_violation');
  }

  if (input.action === 'reject') {
    req.status = 'rejected';
    req.decidedAt = nowIso;
    state.auditLogs.push({
      id: nextId(),
      actorId: actorUserId,
      event: 'unmask_rejected',
      metadata: { requestId: req.id, reason: input.reason },
      createdAt: nowIso,
    });
    return { requestId: req.id, status: 'rejected' };
  }

  req.status = 'approved';
  req.approvedBy = actorUserId;
  req.decidedAt = nowIso;

  const post = state.posts.get(req.postId);
  const authorProfile = post?.authorId ? state.profiles.get(post.authorId) : undefined;

  state.auditLogs.push({
    id: nextId(),
    actorId: actorUserId,
    event: 'unmask_approved_and_disclosed',
    metadata: {
      requestId: req.id,
      postId: req.postId,
      requestedBy: req.requestedBy,
      approvedBy: actorUserId,
      basis: req.basis,
      reference: req.reference,
    },
    createdAt: nowIso,
  });

  return {
    requestId: req.id,
    status: 'approved',
    disclosedIdentity: authorProfile
      ? { userId: authorProfile.id, email: authorProfile.email }
      : null,
  };
}

export function registerSignUpAndDeviceInStore(input: {
  email: string;
  rawDeviceToken: string;
  pepper: string;
}): { userId: string; deviceStatus: 'trusted' | 'pending'; email: string } {
  if (!isAllowedEmailDomain(input.email, state.allowedDomains)) {
    throw new Error('domain_not_allowed');
  }

  const cleanEmail = input.email.trim().toLowerCase();
  let profile = Array.from(state.profiles.values()).find(
    (p) => p.email.toLowerCase() === cleanEmail
  );
  const nowIso = new Date().toISOString();

  if (!profile) {
    const newId = crypto.randomUUID();
    profile = {
      id: newId,
      email: cleanEmail,
      status: 'active',
      statusUntil: null,
      karma: 0,
      zoneId: null,
      zoneVerifiedUntil: null,
      isAdmin: false,
      canModerate: false,
      canUnmask: false,
      adultConfirmedAt: nowIso,
      createdAt: nowIso,
      lastSeenOn: nowIso.slice(0, 10),
    };
    state.profiles.set(newId, profile);

    for (const doc of ['terms', 'privacy', 'community_guidelines'] as const) {
      recordConsentInStore(newId, { document: doc, version: '1.0' });
    }
  }

  const deviceHash = hashDeviceToken(input.rawDeviceToken, input.pepper);
  const existingTrustedForUser = state.devices.find(
    (d) => d.userId === profile.id && d.status === 'trusted'
  );

  if (!existingTrustedForUser) {
    state.devices.push({
      id: crypto.randomUUID(),
      userId: profile.id,
      deviceHash,
      status: 'trusted',
      createdAt: nowIso,
      lastSeenAt: nowIso,
    });
    return { userId: profile.id, deviceStatus: 'trusted', email: profile.email };
  }

  if (existingTrustedForUser.deviceHash === deviceHash) {
    existingTrustedForUser.lastSeenAt = nowIso;
    return { userId: profile.id, deviceStatus: 'trusted', email: profile.email };
  }

  // AUTH-3 & F2: Second device becomes pending until approved from main device or email
  state.devices.push({
    id: crypto.randomUUID(),
    userId: profile.id,
    deviceHash,
    status: 'pending',
    createdAt: nowIso,
    lastSeenAt: nowIso,
  });
  return { userId: profile.id, deviceStatus: 'pending', email: profile.email };
}

export function submitAppealInStore(
  userId: string,
  input: { originalActionId: number; message: string }
): AppealRecord {
  const action = state.moderationActions.find((a) => a.id === input.originalActionId);
  if (!action || action.targetUserRef !== userId) {
    throw new Error('target_unavailable');
  }
  const cleanMsg = input.message.trim();
  if (cleanMsg.length < 5 || cleanMsg.length > 500) {
    throw new Error('invalid_message');
  }
  const existing = state.appeals.find(
    (a) => a.userId === userId && a.originalActionId === input.originalActionId
  );
  if (existing) {
    throw new Error('appeal_already_submitted');
  }
  const record: AppealRecord = {
    id: nextId(),
    userId,
    originalActionId: input.originalActionId,
    message: cleanMsg,
    status: 'open',
    reviewedBy: null,
    decisionNote: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  state.appeals.push(record);
  return record;
}

export function decideAppealInStore(
  actorUserId: string,
  input: { appealId: number; decision: 'upheld' | 'rejected'; note: string }
): AppealRecord {
  const actor = state.profiles.get(actorUserId);
  if (!actor || (!actor.isAdmin && !actor.canModerate)) {
    throw new Error('forbidden');
  }
  const appeal = state.appeals.find((a) => a.id === input.appealId && a.status === 'open');
  if (!appeal) {
    throw new Error('target_unavailable');
  }
  const originalAction = state.moderationActions.find((a) => a.id === appeal.originalActionId);
  if (originalAction && originalAction.actorId === actorUserId) {
    throw new Error('same_moderator_cannot_review_appeal');
  }

  const nowIso = new Date().toISOString();
  appeal.status = input.decision;
  appeal.reviewedBy = actorUserId;
  appeal.decisionNote = input.note.trim();
  appeal.decidedAt = nowIso;

  if (input.decision === 'upheld') {
    const appellant = state.profiles.get(appeal.userId);
    if (appellant) {
      appellant.status = 'active';
      appellant.statusUntil = null;
    }
    if (originalAction?.targetType === 'post' && originalAction.targetId) {
      const p = state.posts.get(originalAction.targetId);
      if (p) {
        p.status = 'published';
        p.hiddenReason = null;
      }
    } else if (originalAction?.targetType === 'reply' && originalAction.targetId) {
      const r = state.replies.get(originalAction.targetId);
      if (r) {
        r.status = 'published';
      }
    }
  }

  state.notifications.unshift({
    id: nextId(),
    userId: appeal.userId,
    type: 'moderation_outcome',
    payload: {
      action: input.decision === 'upheld' ? 'appeal_upheld' : 'appeal_rejected',
      appeal_id: appeal.id,
      note: appeal.decisionNote,
    },
    readAt: null,
    createdAt: nowIso,
  });

  return appeal;
}

export function approvePendingDeviceInStore(input: {
  userId: string;
  rawDeviceToken: string;
  pepper: string;
}): { id: string; status: 'trusted'; approvedAt: string } {
  const deviceHash = hashDeviceToken(input.rawDeviceToken, input.pepper);
  const nowIso = new Date().toISOString();

  for (const d of state.devices) {
    if (d.userId === input.userId && d.status === 'trusted' && d.deviceHash !== deviceHash) {
      d.status = 'revoked';
    }
  }

  const existing = state.devices.find(
    (d) => d.userId === input.userId && d.deviceHash === deviceHash
  );
  if (existing) {
    existing.status = 'trusted';
    existing.lastSeenAt = nowIso;
    return { id: existing.id, status: 'trusted', approvedAt: nowIso };
  }

  const created: DeviceRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    deviceHash,
    status: 'trusted',
    createdAt: nowIso,
    lastSeenAt: nowIso,
  };
  state.devices.push(created);
  return { id: created.id, status: 'trusted', approvedAt: nowIso };
}

function registerOrCheckDeviceForUser(
  userId: string,
  rawDeviceToken: string,
  pepper: string
): 'trusted' | 'pending' {
  const nowIso = new Date().toISOString();
  const deviceHash = hashDeviceToken(rawDeviceToken, pepper);
  const existingTrustedForUser = state.devices.find(
    (d) => d.userId === userId && d.status === 'trusted'
  );

  if (!existingTrustedForUser) {
    state.devices.push({
      id: crypto.randomUUID(),
      userId,
      deviceHash,
      status: 'trusted',
      createdAt: nowIso,
      lastSeenAt: nowIso,
    });
    return 'trusted';
  }

  if (existingTrustedForUser.deviceHash === deviceHash) {
    existingTrustedForUser.lastSeenAt = nowIso;
    return 'trusted';
  }

  state.devices.push({
    id: crypto.randomUUID(),
    userId,
    deviceHash,
    status: 'pending',
    createdAt: nowIso,
    lastSeenAt: nowIso,
  });
  return 'pending';
}

export function isUsernameTakenInStore(rawUsername: string): boolean {
  const clean = rawUsername.trim().toLowerCase();
  return Array.from(state.profiles.values()).some(
    (p) => p.username && p.username.toLowerCase() === clean
  );
}

export function signUpStudentInStore(input: {
  username: string;
  indexNumber: string;
  password: string;
  email?: string;
  rawDeviceToken: string;
  pepper: string;
}): {
  userId: string;
  username: string;
  indexNumber: string;
  email: string;
  authProvider: 'password';
  indexVerified: boolean;
  deviceStatus: 'trusted' | 'pending';
} {
  const cleanUsername = input.username.trim().toLowerCase();
  const cleanIndex = normalizeUpsaIndexNumber(input.indexNumber);
  const cleanEmail = (
    input.email?.trim() || `${cleanIndex.replace(/[^A-Z0-9]/gi, '').toLowerCase()}@st.upsa.edu.gh`
  ).toLowerCase();

  const existingUser = Array.from(state.profiles.values()).find(
    (p) => p.username && p.username.toLowerCase() === cleanUsername
  );
  if (existingUser) {
    throw new Error('username_already_taken');
  }

  const existingDuplicate = Array.from(state.profiles.values()).find(
    (p) =>
      (p.indexNumber && normalizeUpsaIndexNumber(p.indexNumber) === cleanIndex) ||
      p.email.toLowerCase() === cleanEmail
  );

  if (existingDuplicate) {
    throw new Error('student_already_registered');
  }

  const nowIso = new Date().toISOString();
  const validWindowIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const newId = crypto.randomUUID();
  const passwordHash = hashPassword(input.password, input.pepper);

  const profile: ProfileRecord = {
    id: newId,
    email: cleanEmail,
    username: cleanUsername,
    indexNumber: cleanIndex,
    passwordHash,
    authProvider: 'password',
    indexVerifiedAt: nowIso,
    status: 'active',
    statusUntil: null,
    karma: 0,
    zoneId: 1,
    zoneVerifiedUntil: validWindowIso,
    isAdmin: false,
    canModerate: false,
    canUnmask: false,
    adultConfirmedAt: nowIso,
    createdAt: nowIso,
    lastSeenOn: nowIso.slice(0, 10),
  };

  state.profiles.set(newId, profile);
  for (const doc of ['terms', 'privacy', 'community_guidelines'] as const) {
    recordConsentInStore(newId, { document: doc, version: '1.0' });
  }

  const deviceStatus = registerOrCheckDeviceForUser(newId, input.rawDeviceToken, input.pepper);
  return {
    userId: newId,
    username: cleanUsername,
    indexNumber: cleanIndex,
    email: cleanEmail,
    authProvider: 'password',
    indexVerified: true,
    deviceStatus,
  };
}

export function loginStudentInStore(input: {
  identifier: string;
  password: string;
  rawDeviceToken: string;
  pepper: string;
}): {
  userId: string;
  username: string | null;
  indexNumber: string | null;
  email: string;
  authProvider: 'password' | 'google' | 'otp';
  indexVerified: boolean;
  deviceStatus: 'trusted' | 'pending';
} {
  const cleanId = input.identifier.trim();
  const lowerId = cleanId.toLowerCase();
  const normalizedIdx = normalizeUpsaIndexNumber(cleanId);

  const profile = Array.from(state.profiles.values()).find(
    (p) =>
      (p.username && p.username.toLowerCase() === lowerId) ||
      (p.indexNumber && normalizeUpsaIndexNumber(p.indexNumber) === normalizedIdx) ||
      p.email.toLowerCase() === lowerId
  );

  if (!profile || !profile.passwordHash) {
    throw new Error('invalid_credentials');
  }

  if (!verifyPassword(input.password, profile.passwordHash, input.pepper)) {
    throw new Error('invalid_credentials');
  }

  if (profile.status === 'banned' || profile.status === 'deleted') {
    throw new Error(`account_${profile.status}`);
  }

  const deviceStatus = registerOrCheckDeviceForUser(profile.id, input.rawDeviceToken, input.pepper);
  return {
    userId: profile.id,
    username: profile.username ?? null,
    indexNumber: profile.indexNumber ?? null,
    email: profile.email,
    authProvider: profile.authProvider ?? 'password',
    indexVerified: Boolean(profile.indexVerifiedAt),
    deviceStatus,
  };
}

export function googleAuthStudentInStore(input: {
  googleEmail: string;
  username?: string;
  indexNumber?: string;
  rawDeviceToken: string;
  pepper: string;
}): {
  userId: string;
  username: string;
  indexNumber: string | null;
  email: string;
  authProvider: 'google';
  indexVerified: boolean;
  deviceStatus: 'trusted' | 'pending';
} {
  const cleanEmail = input.googleEmail.trim().toLowerCase();
  const cleanIdx = input.indexNumber ? normalizeUpsaIndexNumber(input.indexNumber) : null;
  const nowIso = new Date().toISOString();
  const validWindowIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  let profile = Array.from(state.profiles.values()).find(
    (p) =>
      p.email.toLowerCase() === cleanEmail ||
      (cleanIdx && p.indexNumber && normalizeUpsaIndexNumber(p.indexNumber) === cleanIdx)
  );

  if (!profile) {
    if (!cleanIdx) {
      throw new Error('index_required_for_google_signup');
    }
    const baseUser = (input.username?.trim() || cleanEmail.split('@')[0] || 'upsa_student')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 24);
    const finalUsername = Array.from(state.profiles.values()).some(
      (p) => p.username?.toLowerCase() === baseUser
    )
      ? `${baseUser.slice(0, 18)}_${cleanIdx.slice(-4).toLowerCase()}`
      : baseUser;

    const newId = crypto.randomUUID();
    profile = {
      id: newId,
      email: cleanEmail,
      username: finalUsername,
      indexNumber: cleanIdx,
      passwordHash: null,
      authProvider: 'google',
      indexVerifiedAt: nowIso,
      status: 'active',
      statusUntil: null,
      karma: 0,
      zoneId: 1,
      zoneVerifiedUntil: validWindowIso,
      isAdmin: false,
      canModerate: false,
      canUnmask: false,
      adultConfirmedAt: nowIso,
      createdAt: nowIso,
      lastSeenOn: nowIso.slice(0, 10),
    };
    state.profiles.set(newId, profile);
    for (const doc of ['terms', 'privacy', 'community_guidelines'] as const) {
      recordConsentInStore(newId, { document: doc, version: '1.0' });
    }
  } else {
    profile.authProvider = 'google';
    if (cleanIdx && !profile.indexNumber) {
      profile.indexNumber = cleanIdx;
      profile.indexVerifiedAt = nowIso;
    }
  }

  const deviceStatus = registerOrCheckDeviceForUser(profile.id, input.rawDeviceToken, input.pepper);
  return {
    userId: profile.id,
    username: profile.username ?? cleanEmail.split('@')[0] ?? 'student',
    indexNumber: profile.indexNumber ?? null,
    email: profile.email,
    authProvider: 'google',
    indexVerified: Boolean(profile.indexVerifiedAt),
    deviceStatus,
  };
}

export function requestPasswordResetInStore(input: {
  identifier: string;
  pepper: string;
}): {
  userId: string;
  maskedTarget: string;
  devResetCode: string;
  expiresInMinutes: number;
} {
  const cleanId = input.identifier.trim();
  const lowerId = cleanId.toLowerCase();
  const normalizedIdx = normalizeUpsaIndexNumber(cleanId);

  const profile = Array.from(state.profiles.values()).find(
    (p) =>
      (p.username && p.username.toLowerCase() === lowerId) ||
      (p.indexNumber && normalizeUpsaIndexNumber(p.indexNumber) === normalizedIdx) ||
      p.email.toLowerCase() === lowerId
  );

  if (!profile) {
    throw new Error('account_not_found');
  }

  const seedHash = hashDeviceToken(`reset:${profile.id}:${Date.now()}`, input.pepper);
  const numericCode = String((Number.parseInt(seedHash.slice(0, 8), 16) % 900000) + 100000);
  const codeHash = hashDeviceToken(`reset_code:${profile.id}:${numericCode}`, input.pepper);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  state.passwordResets.set(profile.id, {
    codeHash,
    rawDevCode: numericCode,
    expiresAt,
  });

  const maskedTarget = profile.indexNumber
    ? `Index ***${profile.indexNumber.slice(-4)}`
    : profile.email.replace(/(^..).*(@.*$)/, '$1***$2');

  return {
    userId: profile.id,
    maskedTarget,
    devResetCode: numericCode,
    expiresInMinutes: 15,
  };
}

export function confirmPasswordResetInStore(input: {
  identifier: string;
  resetCode: string;
  newPassword: string;
  pepper: string;
}): {
  userId: string;
  username: string | null;
  indexNumber: string | null;
} {
  const cleanId = input.identifier.trim();
  const lowerId = cleanId.toLowerCase();
  const normalizedIdx = normalizeUpsaIndexNumber(cleanId);

  const profile = Array.from(state.profiles.values()).find(
    (p) =>
      (p.username && p.username.toLowerCase() === lowerId) ||
      (p.indexNumber && normalizeUpsaIndexNumber(p.indexNumber) === normalizedIdx) ||
      p.email.toLowerCase() === lowerId
  );

  if (!profile) {
    throw new Error('invalid_reset_code');
  }

  const stored = state.passwordResets.get(profile.id);
  if (!stored || new Date(stored.expiresAt).getTime() < Date.now()) {
    throw new Error('invalid_reset_code');
  }

  const candidateHash = hashDeviceToken(
    `reset_code:${profile.id}:${input.resetCode.trim()}`,
    input.pepper
  );
  if (candidateHash !== stored.codeHash) {
    throw new Error('invalid_reset_code');
  }

  profile.passwordHash = hashPassword(input.newPassword, input.pepper);
  state.passwordResets.delete(profile.id);

  return {
    userId: profile.id,
    username: profile.username ?? null,
    indexNumber: profile.indexNumber ?? null,
  };
}
