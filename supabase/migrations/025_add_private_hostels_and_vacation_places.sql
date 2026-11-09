-- 025_add_private_hostels_and_vacation_places.sql
-- Expands UPSA Pulse to 24/7/365 Verified Student Membership across private off-campus hostels
-- (Madina, Haatso, Atomic, Agbogba, Adenta, Commuters) and Vacation & Recess periods.

alter table private.zones alter column boundary drop not null;
alter table private.zones drop constraint if exists zones_max_accuracy_m_check;
alter table private.zones add constraint zones_max_accuracy_m_check check (max_accuracy_m between 20 and 10000);

insert into private.zones (id, name, boundary, max_accuracy_m, is_active, updated_at)
overriding system value
values
  (
    5,
    'Private Hostels & Off-Campus',
    null,
    5000,
    true,
    now()
  ),
  (
    6,
    'Vacation & Recess Lounge',
    null,
    5000,
    true,
    now()
  )
on conflict (id) do update
set name = excluded.name,
    boundary = excluded.boundary,
    is_active = excluded.is_active,
    max_accuracy_m = excluded.max_accuracy_m,
    updated_at = now();

select setval(pg_get_serial_sequence('private.zones', 'id'), (select coalesce(max(id), 6) from private.zones));

-- Update current_zone to guarantee active verified students always resolve to a valid zone ID
-- (Physical zone if on campus/hostels, otherwise Private Hostels & Off-Campus [Zone 5])
create or replace function private.current_zone() returns smallint
language sql stable security definer set search_path = private, public as $$
  select coalesce(
    (select zone_id from private.profiles
     where id = auth.uid() and status = 'active' and zone_verified_until > now()),
    (select coalesce(zone_id, 5::smallint) from private.profiles
     where id = auth.uid() and status = 'active'),
    5::smallint
  );
$$;

-- Update verify_user_zone so active verified students located outside physical campus perimeters
-- are granted Private Hostels & Off-Campus presence without locking them out
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
     and z.boundary is not null
     and st_dwithin(z.boundary, v_point, 25)
   order by z.id asc
   limit 1;

  if found then
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
    return;
  end if;

  -- Coordinates are outside physical campus/hostel perimeter (private hostel or vacation home)
  -- Active verified student is granted Private Hostels & Off-Campus zone (ID 5) with 24-hour window
  v_until := now() + interval '24 hours';

  update private.profiles
     set zone_id = coalesce(zone_id, 5::smallint),
         zone_verified_until = v_until,
         last_seen_on = current_date
   where id = p_user_id;

  return query select true, 5::smallint, 'Private Hostels & Off-Campus'::text, v_until, 'ok'::text;
end $$;

revoke all on function private.verify_user_zone(uuid, double precision, double precision, double precision)
  from public, anon, authenticated;

