-- 015 server-side (service role) helper functions for zone verification, moderation, and account lifecycle
create function private.verify_user_zone(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns table (
  verified boolean,
  zone_id smallint,
  zone_name text,
  verified_until timestamptz,
  reason text
)
language plpgsql security definer set search_path = private, public as $$
declare
  v_zone record;
  v_until timestamptz := now() + interval '15 minutes';
begin
  select z.id, z.name, z.max_accuracy_m
  into v_zone
  from private.zones z
  where z.is_active
    and ST_Covers(z.boundary, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
  order by z.id
  limit 1;

  if not found then
    return query select false, null::smallint, null::text, null::timestamptz, 'not_in_zone'::text;
    return;
  end if;

  if p_accuracy > v_zone.max_accuracy_m then
    return query select false, null::smallint, null::text, null::timestamptz, 'accuracy_too_low'::text;
    return;
  end if;

  update private.profiles
  set zone_id = v_zone.id,
      zone_verified_until = v_until,
      last_seen_on = current_date
  where id = p_user_id and status = 'active';

  if not found then
    return query select false, null::smallint, null::text, null::timestamptz, 'user_inactive'::text;
    return;
  end if;

  -- Coordinates are intentionally discarded and never stored or logged.
  return query select true, v_zone.id, v_zone.name, v_until, 'ok'::text;
end $$;

create function private.apply_moderation_action(
  p_actor_id uuid,
  p_target_type private.target_type,
  p_target_id uuid,
  p_action text,
  p_reason text,
  p_suspend_days int default null
)
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_actor record;
  v_post_id uuid;
  v_target_author uuid;
begin
  select is_admin, can_moderate into v_actor from private.profiles where id = p_actor_id and status = 'active';
  if not found or (not v_actor.is_admin and not v_actor.can_moderate) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(p_reason)) < 5 then
    raise exception 'reason_too_short' using errcode = 'P0001';
  end if;

  if p_target_type = 'post' then
    select id, author_id into v_post_id, v_target_author from private.posts where id = p_target_id;
  else
    select post_id, author_id into v_post_id, v_target_author from private.replies where id = p_target_id;
  end if;

  if v_post_id is null then
    raise exception 'target_unavailable' using errcode = 'P0001';
  end if;

  -- App Flow Section 6 conflict-of-interest rule:
  -- Moderator cannot moderate content from threads they participated in
  if exists (
    select 1 from private.thread_aliases ta
    where ta.post_id = v_post_id and ta.user_id = p_actor_id
  ) then
    raise exception 'conflict_of_interest' using errcode = 'P0001';
  end if;

  if p_action = 'restore' then
    if p_target_type = 'post' then
      update private.posts set status = 'published', hidden_reason = null where id = p_target_id;
    else
      update private.replies set status = 'published' where id = p_target_id;
    end if;
    update private.reports set status = 'dismissed', resolved_by = p_actor_id, resolved_at = now()
    where target_type = p_target_type and target_id = p_target_id and status = 'open';
  elsif p_action = 'remove' then
    if p_target_type = 'post' then
      update private.posts set status = 'removed' where id = p_target_id;
    else
      update private.replies set status = 'removed' where id = p_target_id;
    end if;
    update private.reports set status = 'actioned', resolved_by = p_actor_id, resolved_at = now()
    where target_type = p_target_type and target_id = p_target_id and status = 'open';
  elsif p_action = 'suspend' and v_target_author is not null then
    update private.profiles
    set status = 'suspended',
        status_until = now() + make_interval(days => coalesce(p_suspend_days, 7))
    where id = v_target_author;
  elsif p_action = 'ban' and v_target_author is not null then
    if not v_actor.is_admin then
      raise exception 'admin_required_for_ban' using errcode = '42501';
    end if;
    update private.profiles set status = 'banned', status_until = null where id = v_target_author;
  end if;

  insert into private.moderation_actions (actor_id, target_type, target_user_ref, target_id, action, reason)
  values (p_actor_id, p_target_type, v_target_author, p_target_id, p_action, btrim(p_reason));
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

