-- 004 people
create table private.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  status private.user_status not null default 'active',
  status_until timestamptz,
  karma integer not null default 0,
  zone_id smallint references private.zones(id),
  zone_verified_until timestamptz, -- zone and expiry only; no coordinates
  is_admin boolean not null default false,
  can_moderate boolean not null default false,
  can_unmask boolean not null default false,
  adult_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_on date not null default current_date
);

create table private.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null, -- no FK: evidence outlives the account for a set period
  document text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);

create table private.deletion_log (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);

create table private.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(id) on delete cascade,
  device_hash text not null, -- HMAC of device token, never the token
  status private.device_status not null default 'pending',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_hash)
);
create unique index one_trusted_account_per_device on private.devices (device_hash) where status = 'trusted';
create unique index one_trusted_device_per_user on private.devices (user_id) where status = 'trusted';

