-- 016 complete RPC and service-role functions for full live PostgreSQL execution
-- Covers appeals (F15), device trust approval (F2), admin config mutations (ADMIN-1), and case lookup by post/alias.

create or replace function feed.submit_appeal(p_message text)
returns bigint
language plpgsql security definer set search_path = private, public as $$
declare
  v_uid uuid := auth.uid();
  v_status private.user_status;
  v_last_action bigint;
  v_id bigint;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select status into v_status from private.profiles where id = v_uid;
  if v_status not in ('suspended', 'banned') then
    raise exception 'not_restricted' using errcode = 'P0001';
  end if;
  select id into v_last_action
  from private.moderation_actions
  where target_user_ref = v_uid and action in ('suspend', 'ban')
  order by created_at desc
  limit 1;

  insert into private.appeals (user_id, original_action_id, message)
  values (v_uid, v_last_action, btrim(p_message))
  returning id into v_id;

  return v_id;
end $$;

grant execute on function feed.submit_appeal(text) to authenticated;

create or replace function private.decide_appeal(
  p_actor_id uuid,
  p_appeal_id bigint,
  p_decision text,
  p_reason text
)
returns void
language plpgsql security definer set search_path = private, public as $$
declare
  v_actor record;
  v_appeal record;
  v_original_actor uuid;
begin
  select is_admin, can_moderate into v_actor from private.profiles where id = p_actor_id and status = 'active';
  if not found or (not v_actor.is_admin and not v_actor.can_moderate) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_appeal from private.appeals where id = p_appeal_id and status = 'open';
  if not found then
    raise exception 'target_unavailable' using errcode = 'P0001';
  end if;

  if v_appeal.original_action_id is not null then
    select actor_id into v_original_actor from private.moderation_actions where id = v_appeal.original_action_id;
    -- App Flow F15: A different moderator than the original reviews and decides
    if v_original_actor = p_actor_id then
      raise exception 'same_moderator_cannot_review_appeal' using errcode = 'P0001';
    end if;
  end if;

  if p_decision not in ('upheld', 'rejected') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;

  update private.appeals
  set status = p_decision,
      reviewed_by = p_actor_id,
      decided_at = now()
  where id = p_appeal_id;

  if p_decision = 'upheld' then
    update private.profiles
    set status = 'active',
        status_until = null
    where id = v_appeal.user_id;

    insert into private.moderation_actions (actor_id, target_user_ref, action, reason)
    values (p_actor_id, v_appeal.user_id, 'unban', btrim(p_reason));
  end if;

  insert into private.notifications (user_id, type, payload)
  values (
    v_appeal.user_id,
    'appeal_decided',
    jsonb_build_object('appeal_id', p_appeal_id, 'decision', p_decision, 'reason', btrim(p_reason))
  );
end $$;

create or replace function private.approve_pending_device(
  p_user_id uuid,
  p_new_device_hash text
)
returns void
language plpgsql security definer set search_path = private, public as $$
begin
  -- Revoke previous trusted device for this user (F2 step 5)
  update private.devices
  set status = 'revoked', last_seen_at = now()
  where user_id = p_user_id and status = 'trusted';

  -- Promote the pending device to trusted
  insert into private.devices (user_id, device_hash, status, last_seen_at)
  values (p_user_id, p_new_device_hash, 'trusted', now())
  on conflict (user_id, device_hash)
  do update set status = 'trusted', last_seen_at = now();

  insert into private.audit_logs (actor_id, event, metadata)
  values (p_user_id, 'device_trust_transferred', jsonb_build_object('device_hash_prefix', left(p_new_device_hash, 10)));
end $$;

create or replace function private.lookup_case_by_post_or_alias(
  p_actor_id uuid,
  p_post_id uuid,
  p_alias_no integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = private, public as $$
declare
  v_actor record;
  v_target_user uuid;
  v_user_profile record;
  v_history jsonb;
begin
  select is_admin, can_moderate into v_actor from private.profiles where id = p_actor_id and status = 'active';
  if not found or (not v_actor.is_admin and not v_actor.can_moderate) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select user_id into v_target_user
  from private.thread_aliases
  where post_id = p_post_id and alias_no = p_alias_no;

  if v_target_user is null then
    return jsonb_build_object('found', false);
  end if;

  -- Never returns email or raw user_id! Returns only account status and moderation count for ADMIN-1 lookup
  select status, status_until, created_at into v_user_profile
  from private.profiles
  where id = v_target_user;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'action', m.action,
      'reason', m.reason,
      'created_at', m.created_at
    ) order by m.created_at desc
  ), '[]'::jsonb)
  into v_history
  from private.moderation_actions m
  where m.target_user_ref = v_target_user;

  return jsonb_build_object(
    'found', true,
    'postId', p_post_id,
    'aliasNo', p_alias_no,
    'accountStatus', v_user_profile.status,
    'statusUntil', v_user_profile.status_until,
    'memberSince', v_user_profile.created_at,
    'priorActions', v_history
  );
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

