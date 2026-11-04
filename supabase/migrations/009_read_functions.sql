-- 009 read functions
create function feed.list_posts_new(
  p_channel smallint default null,
  p_kind private.post_kind default null,
  p_before_ts timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  channel_id smallint,
  kind private.post_kind,
  body text,
  score integer,
  reply_count integer,
  answered boolean,
  created_at timestamptz,
  is_mine boolean,
  my_vote smallint
)
language plpgsql stable security definer set search_path = private, public as $$
declare v_zone smallint := private.current_zone();
begin
  if v_zone is null then raise exception 'zone_not_verified' using errcode = 'P0001'; end if;
  return query
  select p.id, p.channel_id, p.kind, p.body, p.score, p.reply_count,
         (p.answered_reply_id is not null), p.created_at, (p.author_id = auth.uid()),
         coalesce((select v.value from private.votes v
           where v.user_id = auth.uid() and v.target_type = 'post' and v.target_id = p.id), 0)::smallint
  from private.posts p
  where p.zone_id = v_zone and p.status = 'published'
    and (p_channel is null or p.channel_id = p_channel)
    and (p_kind is null or p.kind = p_kind)
    and (p_before_ts is null or (p.created_at, p.id) < (p_before_ts, p_before_id))
  order by p.created_at desc, p.id desc
  limit least(p_limit, 50);
end $$;

create function feed.list_posts_hot(
  p_channel smallint default null,
  p_kind private.post_kind default null,
  p_before_score double precision default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  channel_id smallint,
  kind private.post_kind,
  body text,
  score integer,
  hot_score double precision,
  reply_count integer,
  answered boolean,
  created_at timestamptz,
  is_mine boolean,
  my_vote smallint
)
language plpgsql stable security definer set search_path = private, public as $$
declare v_zone smallint := private.current_zone();
begin
  if v_zone is null then raise exception 'zone_not_verified' using errcode = 'P0001'; end if;
  return query
  select p.id, p.channel_id, p.kind, p.body, p.score, p.hot_score, p.reply_count,
         (p.answered_reply_id is not null), p.created_at, (p.author_id = auth.uid()),
         coalesce((select v.value from private.votes v
           where v.user_id = auth.uid() and v.target_type = 'post' and v.target_id = p.id), 0)::smallint
  from private.posts p
  where p.zone_id = v_zone and p.status = 'published'
    and (p_channel is null or p.channel_id = p_channel)
    and (p_kind is null or p.kind = p_kind)
    and (p_before_score is null or (p.hot_score, p.id) < (p_before_score, p_before_id))
  order by p.hot_score desc, p.id desc
  limit least(p_limit, 50);
end $$;

create function feed.list_posts_top24(
  p_channel smallint default null,
  p_kind private.post_kind default null,
  p_before_score integer default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  channel_id smallint,
  kind private.post_kind,
  body text,
  score integer,
  reply_count integer,
  answered boolean,
  created_at timestamptz,
  is_mine boolean,
  my_vote smallint
)
language plpgsql stable security definer set search_path = private, public as $$
declare v_zone smallint := private.current_zone();
begin
  if v_zone is null then raise exception 'zone_not_verified' using errcode = 'P0001'; end if;
  return query
  select p.id, p.channel_id, p.kind, p.body, p.score, p.reply_count,
         (p.answered_reply_id is not null), p.created_at, (p.author_id = auth.uid()),
         coalesce((select v.value from private.votes v
           where v.user_id = auth.uid() and v.target_type = 'post' and v.target_id = p.id), 0)::smallint
  from private.posts p
  where p.zone_id = v_zone and p.status = 'published'
    and p.created_at >= now() - interval '24 hours'
    and (p_channel is null or p.channel_id = p_channel)
    and (p_kind is null or p.kind = p_kind)
    and (p_before_score is null or (p.score, p.id) < (p_before_score, p_before_id))
  order by p.score desc, p.id desc
  limit least(p_limit, 50);
end $$;

create function feed.get_thread(p_post uuid)
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
  where p.id = p_post
    and p.zone_id = v_zone
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

create function feed.get_my_profile()
returns table (
  status private.user_status,
  status_until timestamptz,
  karma integer,
  zone_id smallint,
  zone_verified_until timestamptz,
  is_admin boolean,
  can_moderate boolean,
  can_unmask boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = private, public as $$
  select p.status, p.status_until, p.karma, p.zone_id, p.zone_verified_until,
         p.is_admin, p.can_moderate, p.can_unmask, p.created_at
  from private.profiles p
  where p.id = auth.uid();
$$;

create function feed.list_notifications(p_limit integer default 50)
returns table (
  id bigint,
  type text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = private, public as $$
  select n.id, n.type, n.payload, n.read_at, n.created_at
  from private.notifications n
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit least(p_limit, 100);
$$;

create view feed.channels_public as
  select id, slug, name, description, icon, sort_order, allows_ask
  from private.channels where is_active order by sort_order;

