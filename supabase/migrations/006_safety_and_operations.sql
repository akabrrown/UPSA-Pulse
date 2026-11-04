-- 006 safety and operations
create table private.keyword_rules (
  id bigint generated always as identity primary key,
  pattern text not null,
  match_type text not null check (match_type in ('contains','regex')),
  category text not null,
  is_active boolean not null default true
);

create table private.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references private.profiles(id) on delete set null,
  target_type private.target_type not null,
  target_id uuid not null,
  reason private.report_reason not null,
  note text check (char_length(note) <= 300),
  status private.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_by uuid references private.profiles(id) on delete set null,
  resolved_at timestamptz,
  unique (reporter_id, target_type, target_id)
);
create index reports_open_idx on private.reports (target_type, target_id) where status = 'open';

create table private.moderation_actions ( -- append-only
  id bigint generated always as identity primary key,
  actor_id uuid references private.profiles(id) on delete set null,
  target_type private.target_type,
  target_user_ref uuid, -- set only for user-level actions
  target_id uuid,
  action text not null check (action in ('restore','remove','warn','suspend','ban','unban','dismiss_report')),
  reason text not null check (char_length(reason) >= 5),
  created_at timestamptz not null default now()
);

create table private.unmask_requests (
  id bigint generated always as identity primary key,
  post_id uuid not null,
  requested_by uuid not null references private.profiles(id),
  approved_by uuid references private.profiles(id),
  basis text not null check (basis in ('legal_request','credible_threat','upsa_disciplinary_referral')),
  reference text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (approved_by is null or approved_by <> requested_by)
);

create table private.audit_logs ( -- append-only
  id bigint generated always as identity primary key,
  actor_id uuid,
  event text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table private.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references private.profiles(id) on delete cascade,
  type text not null, -- free text so new types need no migration
  payload jsonb not null default '{}', -- never contains author identity
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on private.notifications (user_id, created_at desc);

create table private.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references private.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table private.data_requests (
  id bigint generated always as identity primary key,
  user_id uuid,
  type text not null check (type in ('access','correction')),
  details text,
  status text not null default 'open' check (status in ('open','in_progress','completed','rejected')),
  requested_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '30 days',
  completed_at timestamptz
);

create table private.appeals (
  id bigint generated always as identity primary key,
  user_id uuid not null references private.profiles(id) on delete cascade,
  original_action_id bigint references private.moderation_actions(id),
  message text not null check (char_length(message) between 5 and 500),
  status text not null default 'open' check (status in ('open','upheld','rejected')),
  reviewed_by uuid references private.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index appeals_one_open_per_user on private.appeals (user_id) where status = 'open';

