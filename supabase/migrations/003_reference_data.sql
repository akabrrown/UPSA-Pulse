-- 003 reference data
create table private.zones (
  id smallint generated always as identity primary key,
  name text not null,
  boundary geography(polygon,4326) not null,
  max_accuracy_m int not null default 150 check (max_accuracy_m between 20 and 1000),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index zones_boundary_gix on private.zones using gist (boundary);

create table private.channels (
  id smallint generated always as identity primary key,
  slug citext not null unique,
  name text not null,
  description text not null default '',
  icon text not null,
  sort_order smallint not null default 0,
  allows_ask boolean not null default true,
  is_active boolean not null default true
);

create table private.allowed_domains (
  domain citext primary key,
  is_active boolean not null default true
);

create table private.legal_documents (
  document text not null check (document in ('terms','privacy','community_guidelines')),
  version text not null,
  effective_at timestamptz not null,
  change_summary text not null,
  is_current boolean not null default false,
  primary key (document, version)
);

