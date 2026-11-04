-- 008 write functions (the only way clients change content)
create function feed.create_post(p_channel smallint, p_kind private.post_kind, p_body text)
returns table (post_id uuid, post_status private.content_status, show_support_card boolean)
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_zone smallint := private.current_zone();
  v_body text := btrim(p_body);
  v_status private.content_status;
  v_category text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_zone is null then raise exception 'zone_not_verified' using errcode = 'P0001'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'invalid_body_length' using errcode = 'P0001';
  end if;
  if not exists (select 1 from private.channels c
    where c.id = p_channel and c.is_active and (p_kind = 'post' or c.allows_ask)) then
    raise exception 'invalid_channel' using errcode = 'P0001';
  end if;
  v_status := private.screen_text(v_body);
  v_category := private.matched_keyword_category(v_body);
  insert into private.posts (zone_id, channel_id, author_id, kind, body, status)
  values (v_zone, p_channel, v_uid, p_kind, v_body, v_status)
  returning posts.id into v_id;
  insert into private.thread_aliases (post_id, alias_no, user_id) values (v_id, 0, v_uid); -- OP
  return query select v_id, v_status, coalesce(v_category = 'self_harm', false);
end $$;

create function feed.create_reply(p_post uuid, p_body text)
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
  -- the row lock serialises first replies so two people never get the same alias number
  select p.author_id into v_post_author from private.posts p
  where p.id = p_post and p.zone_id = v_zone and p.status = 'published' for update;
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

create function feed.cast_vote(p_type private.target_type, p_target uuid, p_value smallint)
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
    where p.id = p_target and p.zone_id = v_zone and p.status = 'published';
  else
    select r.author_id into v_author from private.replies r
    join private.posts p on p.id = r.post_id
    where r.id = p_target and p.zone_id = v_zone and r.status = 'published';
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

create function feed.report_content(
  p_type private.target_type,
  p_target uuid,
  p_reason private.report_reason,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_all int;
  v_priority int;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.reports (reporter_id, target_type, target_id, reason, note)
  values (v_uid, p_type, p_target, p_reason, left(p_note, 300))
  on conflict (reporter_id, target_type, target_id) do nothing;
  select count(distinct r.reporter_id),
         count(distinct r.reporter_id) filter (where r.reason in ('self_harm','threat_of_violence','doxxing'))
  into v_all, v_priority
  from private.reports r
  where r.target_type = p_type and r.target_id = p_target and r.status = 'open';
  if v_priority >= 2 or v_all >= 5 then
    if p_type = 'post' then
      update private.posts set status = 'hidden', hidden_reason = 'reports' where id = p_target and status = 'published';
    else
      update private.replies set status = 'hidden' where id = p_target and status = 'published';
    end if;
  end if;
end $$;

create function feed.mark_answer(p_reply uuid)
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_post uuid;
  v_post_author uuid;
  v_post_kind private.post_kind;
  v_reply_author uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select r.post_id, r.author_id, p.author_id, p.kind
  into v_post, v_reply_author, v_post_author, v_post_kind
  from private.replies r
  join private.posts p on p.id = r.post_id
  where r.id = p_reply and r.status = 'published' and p.status = 'published';
  if not found then raise exception 'target_unavailable' using errcode = 'P0001'; end if;
  if v_post_author <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_post_kind <> 'ask' then raise exception 'not_an_ask' using errcode = 'P0001'; end if;
  update private.posts set answered_reply_id = p_reply where id = v_post;
  if v_reply_author is not null and v_reply_author <> v_uid then
    insert into private.notifications (user_id, type, payload)
    values (
      v_reply_author,
      'answer_accepted',
      jsonb_build_object('post_id', v_post, 'reply_id', p_reply)
    );
  end if;
end $$;

create function feed.delete_own_post(p_post uuid)
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update private.posts
  set status = 'removed'
  where id = p_post and author_id = v_uid and status <> 'removed';
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create function feed.record_consent(p_document text, p_version text)
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (
    select 1 from private.legal_documents d
    where d.document = p_document and d.version = p_version
  ) then
    raise exception 'invalid_document_version' using errcode = 'P0001';
  end if;
  insert into private.consents (user_id, document, version)
  values (v_uid, p_document, p_version)
  on conflict (user_id, document, version) do nothing;
end $$;

create function feed.submit_data_request(p_type text, p_details text)
returns bigint
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type not in ('access', 'correction') then
    raise exception 'invalid_request_type' using errcode = 'P0001';
  end if;
  insert into private.data_requests (user_id, type, details)
  values (v_uid, p_type, left(btrim(p_details), 1000))
  returning id into v_id;
  return v_id;
end $$;

create function feed.mark_notifications_read()
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update private.notifications
  set read_at = now()
  where user_id = v_uid and read_at is null;
end $$;

