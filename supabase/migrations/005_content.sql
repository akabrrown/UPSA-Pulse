-- 005 content
create table private.posts (
  id uuid primary key default gen_random_uuid(),
  zone_id smallint not null references private.zones(id),
  channel_id smallint not null references private.channels(id),
  author_id uuid references private.profiles(id) on delete set null,
  kind private.post_kind not null default 'post',
  body text not null check (char_length(body) between 1 and 500),
  status private.content_status not null default 'published',
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  score integer generated always as (upvotes - downvotes) stored,
  reply_count integer not null default 0,
  hot_score double precision not null default 0,
  answered_reply_id uuid,
  hidden_reason text,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz
);
create index posts_new_idx on private.posts (zone_id, created_at desc, id desc) where status = 'published';
create index posts_hot_idx on private.posts (zone_id, hot_score desc, id desc) where status = 'published';
create index posts_channel_new_idx on private.posts (zone_id, channel_id, created_at desc, id desc) where status = 'published';
create index posts_author_idx on private.posts (author_id) where author_id is not null;
create index posts_status_idx on private.posts (status, created_at);

create table private.replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references private.posts(id) on delete cascade,
  author_id uuid references private.profiles(id) on delete set null,
  alias_no integer not null check (alias_no >= 0), -- 0 = OP
  body text not null check (char_length(body) between 1 and 300),
  status private.content_status not null default 'published',
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  score integer generated always as (upvotes - downvotes) stored,
  created_at timestamptz not null default now()
);
create index replies_post_idx on private.replies (post_id, created_at) where status = 'published';
alter table private.posts add constraint posts_answer_fk
  foreign key (answered_reply_id) references private.replies(id) on delete set null;

create table private.thread_aliases (
  post_id uuid not null references private.posts(id) on delete cascade,
  alias_no integer not null,
  user_id uuid references private.profiles(id) on delete set null,
  primary key (post_id, alias_no)
);
create unique index thread_aliases_user_uq on private.thread_aliases (post_id, user_id) where user_id is not null;

create table private.votes (
  user_id uuid not null references private.profiles(id) on delete cascade,
  target_type private.target_type not null,
  target_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index votes_target_idx on private.votes (target_type, target_id);

