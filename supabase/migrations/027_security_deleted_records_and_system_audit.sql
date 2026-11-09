-- 027_security_deleted_records_and_system_audit.sql
-- Security audit tables for storing deleted messages (posts & replies) and deleted user records
-- Compliant with Ghana Data Protection Act 2012 (Act 843) statutory investigation exemptions

create table if not exists private.deleted_messages_audit (
  id bigint generated always as identity primary key,
  message_type text not null check (message_type in ('post', 'reply')),
  original_id uuid not null,
  post_id uuid not null,
  channel_id smallint,
  zone_id smallint,
  author_id uuid,
  body text not null,
  original_created_at timestamptz not null,
  deleted_by uuid,
  deletion_reason text not null,
  deleted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists deleted_messages_audit_orig_idx on private.deleted_messages_audit (original_id);
create index if not exists deleted_messages_audit_author_idx on private.deleted_messages_audit (author_id) where author_id is not null;
create index if not exists deleted_messages_audit_deleted_at_idx on private.deleted_messages_audit (deleted_at desc);

create table if not exists private.deleted_users_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  username text,
  index_number_hash text,
  email_hash text,
  role text,
  reputation integer default 0,
  account_created_at timestamptz,
  deleted_by uuid,
  deletion_reason text,
  deleted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists deleted_users_audit_user_idx on private.deleted_users_audit (user_id);
create index if not exists deleted_users_audit_deleted_at_idx on private.deleted_users_audit (deleted_at desc);

-- Enforce append-only integrity: deleted records archives can never be modified or deleted
create trigger deleted_messages_audit_append_only
  before update or delete on private.deleted_messages_audit
  for each row execute function private.block_mutation();

create trigger deleted_users_audit_append_only
  before update or delete on private.deleted_users_audit
  for each row execute function private.block_mutation();

-- Automatic trigger on private.profiles deletion to archive profile snapshot into private.deleted_users_audit
create or replace function private.archive_deleted_user_audit()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  insert into private.deleted_users_audit (
    user_id,
    username,
    index_number_hash,
    email_hash,
    role,
    reputation,
    account_created_at,
    deleted_by,
    deletion_reason,
    deleted_at,
    metadata
  ) values (
    old.id,
    old.username,
    old.index_number_hash,
    old.email_hash,
    old.role::text,
    old.reputation,
    old.created_at,
    coalesce(auth.uid(), old.id),
    'account_deleted',
    now(),
    jsonb_build_object(
      'status', old.status::text,
      'zone_id', old.zone_id,
      'is_admin', old.is_admin,
      'can_moderate', old.can_moderate
    )
  );
  return old;
end;
$$;

drop trigger if exists archive_deleted_user_audit_trigger on private.profiles;
create trigger archive_deleted_user_audit_trigger
  before delete on private.profiles
  for each row execute function private.archive_deleted_user_audit();

-- Automatic trigger on post status change to 'removed' or DELETE on private.posts
create or replace function private.archive_deleted_post_audit()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if (TG_OP = 'UPDATE' and new.status = 'removed' and old.status <> 'removed') or (TG_OP = 'DELETE') then
    insert into private.deleted_messages_audit (
      message_type,
      original_id,
      post_id,
      channel_id,
      zone_id,
      author_id,
      body,
      original_created_at,
      deleted_by,
      deletion_reason,
      deleted_at,
      metadata
    ) values (
      'post',
      coalesce(old.id, new.id),
      coalesce(old.id, new.id),
      coalesce(old.channel_id, new.channel_id),
      coalesce(old.zone_id, new.zone_id),
      coalesce(old.author_id, new.author_id),
      coalesce(old.body, new.body),
      coalesce(old.created_at, new.created_at),
      auth.uid(),
      coalesce(old.hidden_reason, new.hidden_reason, 'post_removed'),
      now(),
      jsonb_build_object(
        'score', coalesce(old.score, new.score),
        'reply_count', coalesce(old.reply_count, new.reply_count),
        'kind', coalesce(old.kind, new.kind)::text
      )
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists archive_deleted_post_audit_trigger on private.posts;
create trigger archive_deleted_post_audit_trigger
  after update or delete on private.posts
  for each row execute function private.archive_deleted_post_audit();

-- Enable RLS
alter table private.deleted_messages_audit enable row level security;
alter table private.deleted_users_audit enable row level security;

