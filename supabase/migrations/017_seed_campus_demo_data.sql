-- 017 seed verified campus profiles, consents, posts, replies, and thread aliases for initial campus feed
do $$
declare
  u_efua uuid := '11111111-1111-4111-8111-111111111111';
  u_kojo uuid := '22222222-2222-4222-8222-222222222222';
  u_ama  uuid := '33333333-3333-4333-8333-333333333333';
  u_mod  uuid := '44444444-4444-4444-8444-444444444444';
  u_ha   uuid := '55555555-5555-4555-8555-555555555555';
  u_hb   uuid := '66666666-6666-4666-8666-666666666666';
  p1     uuid := 'a0000000-0000-4000-8000-000000000001';
  p2     uuid := 'a0000000-0000-4000-8000-000000000002';
  p3     uuid := 'a0000000-0000-4000-8000-000000000003';
  r1     uuid := 'b0000000-0000-4000-8000-000000000001';
  r2     uuid := 'b0000000-0000-4000-8000-000000000002';
begin
  insert into auth.users (id, email, aud, role, created_at, updated_at) values
    (u_efua, 'efua@st.upsa.edu.gh', 'authenticated', 'authenticated', now(), now()),
    (u_kojo, 'kojo@st.upsa.edu.gh', 'authenticated', 'authenticated', now(), now()),
    (u_ama,  'ama@upsa.edu.gh',     'authenticated', 'authenticated', now(), now()),
    (u_mod,  'moderator@upsa.edu.gh','authenticated', 'authenticated', now(), now()),
    (u_ha,   'holder.a@upsa.edu.gh','authenticated', 'authenticated', now(), now()),
    (u_hb,   'holder.b@upsa.edu.gh','authenticated', 'authenticated', now(), now())
  on conflict (id) do nothing;

  insert into private.profiles (id, status, karma, zone_id, zone_verified_until, is_admin, can_moderate, can_unmask, adult_confirmed_at)
  values
    (u_efua, 'active', 14, 1, now() + interval '24 hours', false, false, false, now()),
    (u_kojo, 'active', 27, 1, now() + interval '24 hours', false, false, false, now()),
    (u_ama,  'active',  9, 1, now() + interval '24 hours', false, false, false, now()),
    (u_mod,  'active',  5, 1, now() + interval '24 hours', true,  true,  false, now()),
    (u_ha,   'active',  0, 1, now() + interval '24 hours', true,  true,  true,  now()),
    (u_hb,   'active',  0, 1, now() + interval '24 hours', true,  true,  true,  now())
  on conflict (id) do update set
    zone_id = excluded.zone_id,
    zone_verified_until = excluded.zone_verified_until,
    is_admin = excluded.is_admin,
    can_moderate = excluded.can_moderate,
    can_unmask = excluded.can_unmask;

  insert into private.consents (user_id, document, version) values
    (u_efua, 'terms', '1.0'),
    (u_efua, 'privacy', '1.0'),
    (u_efua, 'community_guidelines', '1.0'),
    (u_kojo, 'terms', '1.0'),
    (u_kojo, 'privacy', '1.0'),
    (u_kojo, 'community_guidelines', '1.0')
  on conflict do nothing;

  insert into private.posts (id, zone_id, channel_id, author_id, kind, body, status, upvotes, downvotes, reply_count, hot_score, created_at)
  values
    (p1, 1, 1, u_efua, 'ask',  'Level 100 freshers: where do we stamp our medical clearance form before Friday afternoon?', 'published', 14, 1, 2, 4.8, now() - interval '25 minutes'),
    (p2, 1, 3, u_kojo, 'post', 'The jollof queue behind the Auditorium is moving fast right now and plantain is still hot.', 'published', 9, 0, 0, 3.4, now() - interval '12 minutes'),
    (p3, 1, 2, u_ama,  'ask',  'Which hostels near the East Gate have reliable water supply during exam weeks?', 'published', 6, 0, 0, 2.5, now() - interval '4 minutes')
  on conflict (id) do nothing;

  insert into private.thread_aliases (post_id, alias_no, user_id) values
    (p1, 0, u_efua),
    (p1, 1, u_kojo),
    (p1, 2, u_ama),
    (p2, 0, u_kojo),
    (p3, 0, u_ama)
  on conflict do nothing;

  insert into private.replies (id, post_id, author_id, alias_no, body, status, upvotes, downvotes, created_at)
  values
    (r1, p1, u_kojo, 1, 'Go to the University Clinic Annex first, then take the stamped slip to Room 104 in the Admin Block.', 'published', 8, 0, now() - interval '15 minutes'),
    (r2, p1, u_ama,  2, 'Go before 11:00 a.m. with your student ID receipt so you do not wait twice.', 'published', 3, 0, now() - interval '6 minutes')
  on conflict (id) do nothing;

  update private.posts set answered_reply_id = r1 where id = p1;

  insert into private.notifications (user_id, type, payload, created_at)
  values (
    u_efua,
    'reply',
    jsonb_build_object('post_id', p1, 'reply_id', r1, 'alias_no', 1, 'snippet', 'Go to the University Clinic Annex first, then take the stamped slip to Room 104'),
    now() - interval '15 minutes'
  );
end $$;

