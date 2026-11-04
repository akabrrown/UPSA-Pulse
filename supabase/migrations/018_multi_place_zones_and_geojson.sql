-- 018_multi_place_zones_and_geojson.sql
-- Configures exact GeoJSON polygons for UPSA Main Campus (1), Hostel A (2), Hostel B (3), and Hostel C (4),
-- adds 25m indoor GPS buffer in verify_user_zone, and enables cross-place interaction for verified UPSA students.

-- 1. Update Zone 1: UPSA Main Campus
update private.zones
set name = 'UPSA Main Campus',
    boundary = st_geogfromtext(
      'SRID=4326;POLYGON((-0.16780897537910278 5.663307994998718, -0.16444820746650635 5.663307994998718, -0.16469486527935828 5.65965997551568, -0.1659419 5.6596784, -0.1662866 5.6595003, -0.166781 5.6594418, -0.1675333 5.6593093, -0.16780897537910278 5.663307994998718))'
    ),
    max_accuracy_m = 150,
    is_active = true,
    updated_at = now()
where id = 1;

-- 2. Insert/Upsert Zone 2 (Hostel A), Zone 3 (Hostel B), Zone 4 (Hostel C)
insert into private.zones (id, name, boundary, max_accuracy_m, is_active, updated_at)
overriding system value
values
  (
    2,
    'Hostel A',
    st_geogfromtext(
      'SRID=4326;POLYGON((-0.17208705208702213 5.659796149620803, -0.1694471 5.6598067, -0.1691036 5.6590494, -0.1691299 5.6578169, -0.1705793 5.6577008, -0.1720092 5.6581209, -0.17208705208702213 5.659796149620803))'
    ),
    150,
    true,
    now()
  ),
  (
    3,
    'Hostel B',
    st_geogfromtext(
      'SRID=4326;POLYGON((-0.17208705208702213 5.659796149620803, -0.1694471 5.6598067, -0.1691036 5.6590494, -0.1691299 5.6578169, -0.1705793 5.6577008, -0.1720092 5.6581209, -0.17208705208702213 5.659796149620803))'
    ),
    150,
    true,
    now()
  ),
  (
    4,
    'Hostel C',
    st_geogfromtext(
      'SRID=4326;POLYGON((-0.1682361 5.6580372, -0.1674889 5.6581952, -0.1670511 5.6582761, -0.1668003 5.6570124, -0.16814883137669767 5.65660910739598, -0.1682361 5.6580372))'
    ),
    150,
    true,
    now()
  )
on conflict (id) do update
set name = excluded.name,
    boundary = excluded.boundary,
    max_accuracy_m = excluded.max_accuracy_m,
    is_active = excluded.is_active,
    updated_at = now();

select setval(pg_get_serial_sequence('private.zones', 'id'), (select coalesce(max(id), 4) from private.zones));

-- 3. Update verify_user_zone to use ST_DWithin(z.boundary, point, 25) for 25m indoor GPS buffer
create or replace function private.verify_user_zone(
  p_user_id  uuid,
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision
) returns table (
  verified       boolean,
  zone_id        smallint,
  zone_name      text,
  verified_until timestamptz,
  reason         text
)
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_zone record;
  v_until timestamptz;
  v_point geography;
begin
  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  select z.id, z.name, z.max_accuracy_m
    into v_zone
    from private.zones z
   where z.is_active = true
     and st_dwithin(z.boundary, v_point, 25)
   order by z.id asc
   limit 1;

  if not found then
    return query select false, null::smallint, null::text, null::timestamptz, 'not_in_zone';
    return;
  end if;

  if p_accuracy > v_zone.max_accuracy_m then
    return query select false, null::smallint, null::text, null::timestamptz, 'accuracy_too_low';
    return;
  end if;

  v_until := now() + interval '15 minutes';

  update private.profiles
     set zone_id = v_zone.id,
         zone_verified_until = v_until,
         last_seen_on = current_date
   where id = p_user_id;

  return query select true, v_zone.id, v_zone.name, v_until, 'ok';
end $$;

revoke all on function private.verify_user_zone(uuid, double precision, double precision, double precision)
  from public, anon, authenticated;

-- 4. Seed realistic posts across Hostel A (2), Hostel B (3), and Hostel C (4)
insert into private.posts (id, zone_id, channel_id, author_id, kind, body, status, upvotes, downvotes, reply_count, hot_score, created_at, last_activity_at)
values
  (
    'a0000000-0000-4000-8000-000000000004',
    2,
    2,
    '11111111-1111-4111-8111-111111111111',
    'post',
    'Hostel A 3rd floor reading room AC and Wi-Fi are working smoothly right now for anyone prepping for mid-sem.',
    'published',
    11,
    0,
    0,
    3.8,
    now() - interval '18 minutes',
    now() - interval '18 minutes'
  ),
  (
    'a0000000-0000-4000-8000-000000000005',
    3,
    2,
    '22222222-2222-4222-8222-222222222222',
    'ask',
    'Hostel B residents: is the porter lodge still giving out replacement balcony keys before 6 PM today?',
    'published',
    7,
    0,
    0,
    2.6,
    now() - interval '14 minutes',
    now() - interval '14 minutes'
  ),
  (
    'a0000000-0000-4000-8000-000000000006',
    4,
    2,
    '33333333-3333-4333-8333-333333333333',
    'post',
    'Hostel C water pressure is back on all floors and the evening shuttle to the main gate leaves in 10 minutes.',
    'published',
    15,
    0,
    0,
    5.1,
    now() - interval '9 minutes',
    now() - interval '9 minutes'
  )
on conflict (id) do update
set zone_id = excluded.zone_id,
    body = excluded.body,
    status = excluded.status;

insert into private.thread_aliases (post_id, user_id, alias_no)
values
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 0),
  ('a0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 0),
  ('a0000000-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333', 0)
on conflict do nothing;

-- 5. Allow verified UPSA students to view threads, reply, and vote across all active UPSA places
create or replace function feed.get_thread(p_post uuid)
returns jsonb
language plpgsql stable security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_zone smallint := private.current_zone();
  v_post jsonb;
  v_replies jsonb;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_zone is null then raise exception 'zone_not_verified' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'id', p.id,
    'zone_id', p.zone_id,
    'channel_id', p.channel_id,
    'kind', p.kind,
    'body', p.body,
    'status', p.status,
    'score', p.score,
    'reply_count', p.reply_count,
    'answered_reply_id', p.answered_reply_id,
    'created_at', p.created_at,
    'is_mine', (p.author_id = v_uid),
    'my_vote', coalesce((
      select v.value from private.votes v
      where v.user_id = v_uid and v.target_type = 'post' and v.target_id = p.id
    ), 0)
  )
  into v_post
  from private.posts p
  join private.zones z on z.id = p.zone_id and z.is_active = true
  where p.id = p_post
    and (p.status = 'published' or (p.author_id = v_uid and p.status in ('held', 'hidden')));
  if v_post is null then
    raise exception 'post_unavailable' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'post_id', r.post_id,
      'alias_no', r.alias_no,
      'body', r.body,
      'score', r.score,
      'created_at', r.created_at,
      'is_mine', (r.author_id = v_uid),
      'my_vote', coalesce((
        select v.value from private.votes v
        where v.user_id = v_uid and v.target_type = 'reply' and v.target_id = r.id
      ), 0)
    ) order by (r.id = (v_post->>'answered_reply_id')::uuid) desc, r.created_at asc
  ), '[]'::jsonb)
  into v_replies
  from private.replies r
  where r.post_id = p_post and r.status = 'published';
  return jsonb_build_object('post', v_post, 'replies', v_replies);
end $$;

create or replace function feed.create_reply(p_post uuid, p_body text)
returns table (reply_id uuid, reply_status private.content_status, reply_alias integer, show_support_card boolean)
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_zone smallint := private.current_zone();
  v_body text := btrim(p_body);
  v_alias integer;
  v_status private.content_status;
  v_category text;
  v_id uuid;
  v_post_author uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_zone is null then raise exception 'zone_not_verified' using errcode = 'P0001'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 300 then
    raise exception 'invalid_body_length' using errcode = 'P0001';
  end if;
  select p.author_id into v_post_author from private.posts p
  join private.zones z on z.id = p.zone_id and z.is_active = true
  where p.id = p_post and p.status = 'published' for update of p;
  if not found then raise exception 'post_unavailable' using errcode = 'P0001'; end if;
  select ta.alias_no into v_alias from private.thread_aliases ta
  where ta.post_id = p_post and ta.user_id = v_uid;
  if v_alias is null then
    select coalesce(max(ta.alias_no), 0) + 1 into v_alias from private.thread_aliases ta where ta.post_id = p_post;
    insert into private.thread_aliases (post_id, alias_no, user_id) values (p_post, v_alias, v_uid);
  end if;
  v_status := private.screen_text(v_body);
  v_category := private.matched_keyword_category(v_body);
  insert into private.replies (post_id, author_id, alias_no, body, status)
  values (p_post, v_uid, v_alias, v_body, v_status)
  returning replies.id into v_id;
  if v_status = 'published' and v_post_author is not null and v_post_author <> v_uid then
    insert into private.notifications (user_id, type, payload)
    values (
      v_post_author,
      'reply',
      jsonb_build_object(
        'post_id', p_post,
        'reply_id', v_id,
        'alias_no', v_alias,
        'snippet', left(v_body, 80)
      )
    );
  end if;
  return query select v_id, v_status, v_alias, coalesce(v_category = 'self_harm', false);
end $$;

create or replace function feed.cast_vote(p_type private.target_type, p_target uuid, p_value smallint)
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_zone smallint := private.current_zone();
  v_author uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_zone is null then raise exception 'zone_not_verified' using errcode = 'P0001'; end if;
  if p_value not in (-1, 0, 1) then raise exception 'invalid_vote' using errcode = 'P0001'; end if;
  if p_type = 'post' then
    select p.author_id into v_author from private.posts p
    join private.zones z on z.id = p.zone_id and z.is_active = true
    where p.id = p_target and p.status = 'published';
  else
    select r.author_id into v_author from private.replies r
    join private.posts p on p.id = r.post_id
    join private.zones z on z.id = p.zone_id and z.is_active = true
    where r.id = p_target and r.status = 'published';
  end if;
  if not found then raise exception 'target_unavailable' using errcode = 'P0001'; end if;
  if v_author = v_uid then raise exception 'own_content' using errcode = 'P0001'; end if;
  if p_value = 0 then
    delete from private.votes where user_id = v_uid and target_type = p_type and target_id = p_target;
  else
    insert into private.votes (user_id, target_type, target_id, value)
    values (v_uid, p_type, p_target, p_value)
    on conflict (user_id, target_type, target_id) do update set value = excluded.value;
  end if;
end $$;

