-- =============================================================================
-- UPSA Pulse — Migration 019: Student Index Number, Username, Password, Google Auth & Password Reset
-- =============================================================================

alter table private.profiles
  add column if not exists username citext unique,
  add column if not exists index_number citext unique,
  add column if not exists password_hash text,
  add column if not exists auth_provider text not null default 'password'
    check (auth_provider in ('password', 'google', 'otp')),
  add column if not exists index_verified_at timestamptz;

create index if not exists profiles_username_idx on private.profiles (username);
create index if not exists profiles_index_number_idx on private.profiles (index_number);

-- Update seeded student accounts with UPSA usernames and student index numbers
update private.profiles
set username = 'efua_upsa',
    index_number = '10284001',
    auth_provider = 'password',
    index_verified_at = now()
where id = '11111111-1111-4111-8111-111111111111'::uuid
  and username is null;

update private.profiles
set username = 'kojo_upsa',
    index_number = '10284002',
    auth_provider = 'password',
    index_verified_at = now()
where id = '22222222-2222-4222-8222-222222222222'::uuid
  and username is null;

update private.profiles
set username = 'ama_upsa',
    index_number = '10284003',
    auth_provider = 'password',
    index_verified_at = now()
where id = '33333333-3333-4333-8333-333333333333'::uuid
  and username is null;

-- Password reset tokens table (private schema, server-only access with RLS enabled)
create table if not exists private.password_reset_tokens (
  user_id    uuid primary key references private.profiles(id) on delete cascade,
  code_hash  text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table private.password_reset_tokens enable row level security;
alter table private.password_reset_tokens force row level security;

