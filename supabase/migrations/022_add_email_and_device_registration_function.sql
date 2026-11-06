-- 022: Add email column to private.profiles and define device registration function
alter table private.profiles add column if not exists email citext;
create index if not exists profiles_email_idx on private.profiles (email);

create or replace function private.register_or_check_device(
  p_user_id uuid,
  p_device_hash text
)
returns text
language plpgsql security definer set search_path = private, public as $$
declare
  v_trusted_hash text;
begin
  select device_hash into v_trusted_hash
  from private.devices
  where user_id = p_user_id and status = 'trusted'
  limit 1;

  if v_trusted_hash is null then
    insert into private.devices (user_id, device_hash, status, last_seen_at)
    values (p_user_id, p_device_hash, 'trusted', now())
    on conflict (user_id, device_hash)
    do update set status = 'trusted', last_seen_at = now();
    return 'trusted';
  end if;

  if v_trusted_hash = p_device_hash then
    update private.devices
    set last_seen_at = now()
    where user_id = p_user_id and device_hash = p_device_hash;
    return 'trusted';
  end if;

  insert into private.devices (user_id, device_hash, status, last_seen_at)
  values (p_user_id, p_device_hash, 'pending', now())
  on conflict (user_id, device_hash)
  do update set last_seen_at = now();
  return 'pending';
end $$;

