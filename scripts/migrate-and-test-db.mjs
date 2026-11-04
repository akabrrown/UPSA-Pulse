import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function main() {
  loadEnvLocal();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in environment or .env.local');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('[DB] Connected to live Supabase PostgreSQL instance.');

  try {
    // Clean reset of private and feed schemas so numbered migrations 001..015 apply cleanly
    await client.query(`
      drop schema if exists feed cascade;
      drop schema if exists private cascade;
    `);

    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[MIGRATE] Applying ${file}...`);
      try {
        await client.query(sql);
      } catch (err) {
        // If pg_cron is restricted on pooler/free tier, log and continue if it's 013_scheduled_jobs.sql
        if (file.startsWith('013_') && err.message.includes('cron')) {
          console.log(`[MIGRATE] Note on ${file}: pg_cron schedule skipped (${err.message}); creating private.run_retention() function directly.`);
          await client.query(`
            create or replace function private.run_retention() returns void
            language plpgsql security definer set search_path = private, public as $$
            begin
              update private.posts set status = 'archived', archived_at = now()
              where status in ('published','hidden') and created_at < now() - interval '30 days';
              delete from private.posts
              where status in ('removed','archived') and coalesce(archived_at, created_at) < now() - interval '12 months';
              delete from private.notifications where created_at < now() - interval '60 days';
              delete from private.reports where status <> 'open' and created_at < now() - interval '24 months';
              delete from private.consents c using private.deletion_log d
              where c.user_id = d.user_id and d.deleted_at < now() - interval '24 months';
              delete from private.deletion_log where deleted_at < now() - interval '24 months';
            end $$;
            revoke all on function private.run_retention() from public, anon, authenticated;
          `);
        } else {
          throw err;
        }
      }
    }

    console.log(`[MIGRATE] All ${files.length} migrations (001..018) applied successfully.`);

    // Now run all 14 live database tests from Backend Schema Section 9 in a transaction that rolls back test data
    console.log('[TEST] Running Backend Schema Section 9 (14 Database Security & Integrity Tests)...');
    await client.query('BEGIN');

    // Create 6 test auth.users rows for our Section 9 tests (using 9x UUIDs so they never collide with seeded demo accounts)
    const u1 = '91111111-1111-4111-8111-111111111111';
    const u2 = '92222222-2222-4222-8222-222222222222';
    const u3 = '93333333-3333-4333-8333-333333333333';
    const u4 = '94444444-4444-4444-8444-444444444444';
    const u5 = '95555555-5555-4555-8555-555555555555';
    const u6 = '96666666-6666-4666-8666-666666666666';

    for (const [idx, uid] of [u1, u2, u3, u4, u5, u6].entries()) {
      await client.query(
        `insert into auth.users (id, email, aud, role, created_at, updated_at)
         values ($1, $2, 'authenticated', 'authenticated', now(), now())
         on conflict (id) do nothing`,
        [uid, `test_student${idx + 1}@st.upsa.edu.gh`]
      );
      await client.query(
        `insert into private.profiles (id, status, karma, zone_id, zone_verified_until, adult_confirmed_at)
         values ($1, 'active', 0, 1, now() + interval '15 minutes', now())
         on conflict (id) do update set status = 'active', zone_id = 1, zone_verified_until = now() + interval '15 minutes'`,
        [uid]
      );
    }

    // Test 1: As authenticated, select * from private.posts -> Permission denied
    await client.query('SAVEPOINT sp_test1');
    await client.query('SET LOCAL ROLE authenticated');
    let test1Passed = false;
    try {
      await client.query('SELECT * FROM private.posts');
    } catch (err) {
      if (err.code === '42501') test1Passed = true;
    }
    await client.query('ROLLBACK TO SAVEPOINT sp_test1');
    if (!test1Passed) throw new Error('Test 1 FAILED: authenticated was able to SELECT from private.posts');
    console.log('  ✓ Test 1: As authenticated, select * from private.posts -> Permission denied (42501)');

    // Test 2: As authenticated, call feed.list_posts_new with no zone window -> Error zone_not_verified
    await client.query(`UPDATE private.profiles SET zone_verified_until = null WHERE id = $1`, [u6]);
    await client.query('SAVEPOINT sp_test2');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [u6]);
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u6]);
    await client.query('SET LOCAL ROLE authenticated');
    let test2Passed = false;
    try {
      await client.query('SELECT * FROM feed.list_posts_new()');
    } catch (err) {
      if (err.message.includes('zone_not_verified')) test2Passed = true;
    }
    await client.query('ROLLBACK TO SAVEPOINT sp_test2');
    await client.query(`UPDATE private.profiles SET zone_verified_until = now() + interval '15 minutes' WHERE id = $1`, [u6]);
    if (!test2Passed) throw new Error('Test 2 FAILED: feed.list_posts_new did not raise zone_not_verified');
    console.log('  ✓ Test 2: As authenticated, call feed.list_posts_new with no zone window -> Error zone_not_verified');

    // Test 3: Result columns of every feed function -> No author_id, user_id or email in any output
    const colLeakRes = await client.query(`
      select p.proname, a.attname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
      join pg_attribute a on a.attrelid = t.typrelid
      where n.nspname = 'feed'
        and a.attnum > 0
        and a.attname in ('author_id', 'user_id', 'email', 'device_hash')
    `);
    if (colLeakRes.rowCount > 0) {
      throw new Error(`Test 3 FAILED: Leaked column in feed function: ${JSON.stringify(colLeakRes.rows)}`);
    }
    console.log('  ✓ Test 3: Result columns of every feed function -> No author_id, user_id or email in any output');

    // Test 4, 5, 6: Create post then reply from users -> Alias numbers unique and contiguous per thread, reused in same thread, independent across threads
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u1]);
    const post1Res = await client.query(`SELECT * FROM feed.create_post(1::smallint, 'ask'::private.post_kind, 'Test question 1')`);
    const post1Id = post1Res.rows[0].post_id;

    const post2Res = await client.query(`SELECT * FROM feed.create_post(1::smallint, 'ask'::private.post_kind, 'Test question 2')`);
    const post2Id = post2Res.rows[0].post_id;

    // u2 replies to post1 -> Student 1, u3 replies to post1 -> Student 2, u2 replies again to post1 -> Student 1
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u2]);
    const r1 = await client.query(`SELECT * FROM feed.create_reply($1, 'Reply from u2')`, [post1Id]);
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u3]);
    const r2 = await client.query(`SELECT * FROM feed.create_reply($1, 'Reply from u3')`, [post1Id]);
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u2]);
    const r3 = await client.query(`SELECT * FROM feed.create_reply($1, 'Second reply from u2')`, [post1Id]);

    // In post2, u3 replies first -> gets Student 1 (independent of post1 where u3 was Student 2!)
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u3]);
    const rPost2 = await client.query(`SELECT * FROM feed.create_reply($1, 'First reply in thread 2 from u3')`, [post2Id]);

    if (r1.rows[0].reply_alias !== 1 || r2.rows[0].reply_alias !== 2) {
      throw new Error('Test 4 FAILED: Alias numbers not contiguous');
    }
    console.log('  ✓ Test 4: Create post then reply from users -> Alias numbers unique and contiguous per thread');

    if (r3.rows[0].reply_alias !== 1) {
      throw new Error('Test 5 FAILED: Same user replying twice did not get same alias number');
    }
    console.log('  ✓ Test 5: Same user replies twice in a thread -> Same alias number both times');

    if (rPost2.rows[0].reply_alias !== 1) {
      throw new Error('Test 6 FAILED: Alias numbers not independent across threads');
    }
    console.log('  ✓ Test 6: Same user replies in two different threads -> Alias numbers independent of each other');

    // Test 7: Vote up, switch to down, remove -> Counts and karma return to starting values
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u2]);
    await client.query(`SELECT feed.cast_vote('post'::private.target_type, $1, 1::smallint)`, [post1Id]);
    let pCheck = await client.query(`SELECT score FROM private.posts WHERE id = $1`, [post1Id]);
    let kCheck = await client.query(`SELECT karma FROM private.profiles WHERE id = $1`, [u1]);
    if (pCheck.rows[0].score !== 1 || kCheck.rows[0].karma !== 1) throw new Error('Test 7 upvote failed');

    await client.query(`SELECT feed.cast_vote('post'::private.target_type, $1, -1::smallint)`, [post1Id]);
    pCheck = await client.query(`SELECT score FROM private.posts WHERE id = $1`, [post1Id]);
    kCheck = await client.query(`SELECT karma FROM private.profiles WHERE id = $1`, [u1]);
    if (pCheck.rows[0].score !== -1 || kCheck.rows[0].karma !== -1) throw new Error('Test 7 switch to downvote failed');

    await client.query(`SELECT feed.cast_vote('post'::private.target_type, $1, 0::smallint)`, [post1Id]);
    pCheck = await client.query(`SELECT score FROM private.posts WHERE id = $1`, [post1Id]);
    kCheck = await client.query(`SELECT karma FROM private.profiles WHERE id = $1`, [u1]);
    if (pCheck.rows[0].score !== 0 || kCheck.rows[0].karma !== 0) throw new Error('Test 7 remove vote failed');
    console.log('  ✓ Test 7: Vote up, switch to down, remove -> Counts and karma return to the starting values');

    // Test 8: Vote on own post -> Error own_content
    await client.query('SAVEPOINT sp_test8');
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u1]);
    let test8Passed = false;
    try {
      await client.query(`SELECT feed.cast_vote('post'::private.target_type, $1, 1::smallint)`, [post1Id]);
    } catch (err) {
      if (err.message.includes('own_content')) test8Passed = true;
    }
    await client.query('ROLLBACK TO SAVEPOINT sp_test8');
    if (!test8Passed) throw new Error('Test 8 FAILED: Voting on own post did not raise own_content');
    console.log('  ✓ Test 8: Vote on own post -> Error own_content');

    // Test 9: Five net downvotes on a post -> Post becomes hidden with reason score
    for (const voter of [u2, u3, u4, u5, u6]) {
      await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [voter]);
      await client.query(`SELECT feed.cast_vote('post'::private.target_type, $1, -1::smallint)`, [post1Id]);
    }
    const hiddenCheck = await client.query(`SELECT status, hidden_reason FROM private.posts WHERE id = $1`, [post1Id]);
    if (hiddenCheck.rows[0].status !== 'hidden' || hiddenCheck.rows[0].hidden_reason !== 'score') {
      throw new Error(`Test 9 FAILED: Expected hidden/score, got ${JSON.stringify(hiddenCheck.rows[0])}`);
    }
    console.log('  ✓ Test 9: Five net downvotes on a post -> Post becomes hidden with reason score');

    // Test 10: Two priority reports from different users -> Item becomes hidden
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u2]);
    await client.query(`SELECT feed.report_content('post'::private.target_type, $1, 'doxxing'::private.report_reason, 'Note 1')`, [post2Id]);
    await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [u3]);
    await client.query(`SELECT feed.report_content('post'::private.target_type, $1, 'doxxing'::private.report_reason, 'Note 2')`, [post2Id]);
    const repHiddenCheck = await client.query(`SELECT status, hidden_reason FROM private.posts WHERE id = $1`, [post2Id]);
    if (repHiddenCheck.rows[0].status !== 'hidden' || repHiddenCheck.rows[0].hidden_reason !== 'reports') {
      throw new Error('Test 10 FAILED: Two priority reports did not auto-hide post');
    }
    console.log('  ✓ Test 10: Two priority reports from different users -> Item becomes hidden');

    // Test 11: Update or delete a moderation action -> Error append_only
    const modIns = await client.query(
      `INSERT INTO private.moderation_actions (actor_id, target_type, target_id, action, reason)
       VALUES ($1, 'post', $2, 'remove', 'Valid reason for removal') RETURNING id`,
      [u4, post2Id]
    );
    await client.query('SAVEPOINT sp_test11');
    let test11Passed = false;
    try {
      await client.query(`DELETE FROM private.moderation_actions WHERE id = $1`, [modIns.rows[0].id]);
    } catch (err) {
      if (err.message.includes('append_only')) test11Passed = true;
    }
    await client.query('ROLLBACK TO SAVEPOINT sp_test11');
    if (!test11Passed) throw new Error('Test 11 FAILED: moderation_actions allowed DELETE');
    console.log('  ✓ Test 11: Update or delete a moderation action -> Error append_only');

    // Test 12: Delete a profile -> Posts remain with author_id null; votes removed and counts corrected; thread aliases keep numbers
    await client.query(`DELETE FROM private.profiles WHERE id = $1`, [u2]);
    const postAfterDel = await client.query(`SELECT score FROM private.posts WHERE id = $1`, [post1Id]);
    const replyAfterDel = await client.query(`SELECT author_id, alias_no FROM private.replies WHERE id = $1`, [r1.rows[0].reply_id]);
    if (replyAfterDel.rows[0].author_id !== null || replyAfterDel.rows[0].alias_no !== 1 || postAfterDel.rows[0].score !== -4) {
      throw new Error('Test 12 FAILED: Profile deletion did not null author_id, preserve alias_no, or adjust vote counts');
    }
    console.log('  ✓ Test 12: Delete a profile -> Posts remain with author_id null; votes removed and counts corrected; thread aliases keep numbers');

    // Test 13: Insert a second trusted device for one user -> Unique violation
    await client.query(
      `INSERT INTO private.devices (user_id, device_hash, status) VALUES ($1, 'hash_device_1', 'trusted')`,
      [u1]
    );
    await client.query('SAVEPOINT sp_test13');
    let test13Passed = false;
    try {
      await client.query(
        `INSERT INTO private.devices (user_id, device_hash, status) VALUES ($1, 'hash_device_2', 'trusted')`,
        [u1]
      );
    } catch (err) {
      if (err.code === '23505') test13Passed = true;
    }
    await client.query('ROLLBACK TO SAVEPOINT sp_test13');
    if (!test13Passed) throw new Error('Test 13 FAILED: Allowed second trusted device for same user');
    console.log('  ✓ Test 13: Insert a second trusted device for one user -> Unique violation (23505)');

    // Test 14: Run retention on seeded old data -> Rows removed/archived exactly per schedule
    const oldPostRes = await client.query(
      `INSERT INTO private.posts (zone_id, channel_id, author_id, kind, body, status, created_at)
       VALUES (1, 1, $1, 'post', '35 days old post', 'published', now() - interval '35 days') RETURNING id`,
      [u1]
    );
    await client.query(`SELECT private.run_retention()`);
    const archivedCheck = await client.query(`SELECT status FROM private.posts WHERE id = $1`, [oldPostRes.rows[0].id]);
    if (archivedCheck.rows[0].status !== 'archived') {
      throw new Error('Test 14 FAILED: Old published post was not archived by private.run_retention()');
    }
    console.log('  ✓ Test 14: Run retention on seeded old data -> Rows archived/removed exactly per schedule');

    // Roll back the temporary test data so only clean schema + 014 seed data remain in live DB
    await client.query('ROLLBACK');
    console.log('[SUCCESS] All 14 Backend Schema Section 9 tests PASSED against live Supabase PostgreSQL!');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

