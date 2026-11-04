**UPSA PULSE · WORKING TITLE**  
**Backend Schema**  
Database design, access rules, functions and retention

| **Field** | **Detail** |
| --- | --- |
| Project | Jodel-style, location-gated, pseudonymous campus feed for UPSA students |
| Document | Backend Schema |
| Version | 1.0 (draft for review) |
| Date | 17 October 2026 |
| Prepared by | Codey Dev (Aka Brown) |
| Status | Draft. Colour palette is a proposal pending sampling from official UPSA artwork. Items marked \[DECISION\] need an owner answer before build. Legal points are flagged for verification and are not legal advice. |

1\. Principles
==============

*   **Two schemas, one rule.** private holds every table and is never exposed through the API. feed holds only views and functions. The client can do nothing the functions do not allow.
*   **Identity never leaves the database.** author\_id exists on posts and replies for moderation and legal process, but no client-facing function returns it.
*   **Counts by trigger, not by application code,** so they cannot drift.
*   **Append-only where it matters:** moderation actions and audit logs cannot be updated or deleted.
*   **No coordinates.** The profile keeps a zone id and an expiry, nothing about where inside the zone a person was.
*   **Status values and text types stay flexible** (for example notification type is free text) so features can be added without migrations.

2\. Entity overview
===================

| **Entity** | **Purpose** | **Key relationships** |
| --- | --- | --- |
| profiles | One per auth user: status, karma, flags, zone window | 1:1 with auth.users; deleting the auth user cascades |
| devices | Device trust, one trusted per user and per device hash | N:1 profiles |
| consents, legal\_documents, deletion\_log | Versioned acceptance of legal documents; evidence after deletion for a set period | consents by user id without a foreign key by design |
| zones, channels, allowed\_domains | Admin-managed reference data | zones 1:N posts; channels 1:N posts |
| posts | Top-level items, with kind post or ask | N:1 zones, channels, profiles (author nulled on deletion) |
| replies | Flat replies with thread alias number | N:1 posts (cascade), profiles (nulled) |
| thread\_aliases | Maps users to alias numbers inside one thread; 0 is OP | N:1 posts, profiles |
| votes | One vote per user per item | N:1 profiles; target is a post or reply id |
| reports, moderation\_actions, unmask\_requests, audit\_logs | Safety workflow and its permanent record | Reference content by id without foreign keys so records survive removals |
| notifications, push\_subscriptions | Alerts and Web Push endpoints | N:1 profiles (cascade) |
| data\_requests | Access and correction requests with due dates | Optional user id |
| keyword\_rules | Pre-screen patterns | None |

auth.users 1──1 profiles 1──N devices  
│ 1──N posts N──1 channels ; posts N──1 zones  
│ │ 1──N replies  
│ └ 1──N thread\_aliases (post\_id, alias\_no, user\_id)  
└ 1──N votes ──▶ (post | reply) by id  
reports, moderation\_actions, audit\_logs ──▶ reference posts/replies by id

3\. Database setup
==================

Run the files in this order as numbered migrations. Parts 3 to 8 below are the complete DDL. The SQL was syntax-checked with a PostgreSQL parser, but it has not yet been executed against a live Supabase project: the first task in Phase 0 is to apply it to a scratch project and run the tests in section 9.

3.1 Extensions, schemas and enums
---------------------------------

\-- 001 extensions and schemas  
create extension if not exists postgis;  
create extension if not exists pgcrypto;  
create extension if not exists pg\_cron;  
create extension if not exists citext;  
  
create schema if not exists private; -- tables; never exposed through the API  
create schema if not exists feed; -- views and RPC functions; the only exposed schema  
revoke all on schema private from public, anon, authenticated;  
  
\-- 002 enums  
create type private.post\_kind as enum ('post','ask');  
create type private.content\_status as enum ('published','held','hidden','removed','archived');  
create type private.user\_status as enum ('active','suspended','banned','deleted');  
create type private.target\_type as enum ('post','reply');  
create type private.report\_reason as enum ('self\_harm','threat\_of\_violence','doxxing','harassment',  
'hate','sexual','exam\_leak','false\_claim','spam','other');  
create type private.report\_status as enum ('open','actioned','dismissed');  
create type private.device\_status as enum ('trusted','pending','revoked');

4\. Tables
==========

\-- 003 reference data  
create table private.zones (  
id smallint generated always as identity primary key,  
name text not null,  
boundary geography(polygon,4326) not null,  
max\_accuracy\_m int not null default 150 check (max\_accuracy\_m between 20 and 1000),  
is\_active boolean not null default true,  
updated\_at timestamptz not null default now()  
);  
create index zones\_boundary\_gix on private.zones using gist (boundary);  
  
create table private.channels (  
id smallint generated always as identity primary key,  
slug citext not null unique,  
name text not null,  
description text not null default '',  
icon text not null,  
sort\_order smallint not null default 0,  
allows\_ask boolean not null default true,  
is\_active boolean not null default true  
);  
  
create table private.allowed\_domains (  
domain citext primary key,  
is\_active boolean not null default true  
);  
  
create table private.legal\_documents (  
document text not null check (document in ('terms','privacy','community\_guidelines')),  
version text not null,  
effective\_at timestamptz not null,  
change\_summary text not null,  
is\_current boolean not null default false,  
primary key (document, version)  
);  
  
\-- 004 people  
create table private.profiles (  
id uuid primary key references auth.users(id) on delete cascade,  
status private.user\_status not null default 'active',  
status\_until timestamptz,  
karma integer not null default 0,  
zone\_id smallint references private.zones(id),  
zone\_verified\_until timestamptz, -- zone and expiry only; no coordinates  
is\_admin boolean not null default false,  
can\_moderate boolean not null default false,  
can\_unmask boolean not null default false,  
adult\_confirmed\_at timestamptz not null,  
created\_at timestamptz not null default now(),  
last\_seen\_on date not null default current\_date  
);  
  
create table private.consents (  
id bigint generated always as identity primary key,  
user\_id uuid not null, -- no FK: evidence outlives the account for a set period  
document text not null,  
version text not null,  
accepted\_at timestamptz not null default now(),  
unique (user\_id, document, version)  
);  
  
create table private.deletion\_log (  
user\_id uuid primary key,  
deleted\_at timestamptz not null default now()  
);  
  
create table private.devices (  
id uuid primary key default gen\_random\_uuid(),  
user\_id uuid not null references private.profiles(id) on delete cascade,  
device\_hash text not null, -- HMAC of device token, never the token  
status private.device\_status not null default 'pending',  
created\_at timestamptz not null default now(),  
last\_seen\_at timestamptz not null default now(),  
unique (user\_id, device\_hash)  
);  
create unique index one\_trusted\_account\_per\_device on private.devices (device\_hash) where status = 'trusted';  
create unique index one\_trusted\_device\_per\_user on private.devices (user\_id) where status = 'trusted';  
  
\-- 005 content  
create table private.posts (  
id uuid primary key default gen\_random\_uuid(),  
zone\_id smallint not null references private.zones(id),  
channel\_id smallint not null references private.channels(id),  
author\_id uuid references private.profiles(id) on delete set null,  
kind private.post\_kind not null default 'post',  
body text not null check (char\_length(body) between 1 and 500),  
status private.content\_status not null default 'published',  
upvotes integer not null default 0 check (upvotes >= 0),  
downvotes integer not null default 0 check (downvotes >= 0),  
score integer generated always as (upvotes - downvotes) stored,  
reply\_count integer not null default 0,  
hot\_score double precision not null default 0,  
answered\_reply\_id uuid,  
hidden\_reason text,  
created\_at timestamptz not null default now(),  
last\_activity\_at timestamptz not null default now(),  
archived\_at timestamptz  
);  
create index posts\_new\_idx on private.posts (zone\_id, created\_at desc, id desc) where status = 'published';  
create index posts\_hot\_idx on private.posts (zone\_id, hot\_score desc, id desc) where status = 'published';  
create index posts\_channel\_new\_idx on private.posts (zone\_id, channel\_id, created\_at desc, id desc) where status = 'published';  
create index posts\_author\_idx on private.posts (author\_id) where author\_id is not null;  
create index posts\_status\_idx on private.posts (status, created\_at);  
  
create table private.replies (  
id uuid primary key default gen\_random\_uuid(),  
post\_id uuid not null references private.posts(id) on delete cascade,  
author\_id uuid references private.profiles(id) on delete set null,  
alias\_no integer not null check (alias\_no >= 0), -- 0 = OP  
body text not null check (char\_length(body) between 1 and 300),  
status private.content\_status not null default 'published',  
upvotes integer not null default 0 check (upvotes >= 0),  
downvotes integer not null default 0 check (downvotes >= 0),  
score integer generated always as (upvotes - downvotes) stored,  
created\_at timestamptz not null default now()  
);  
create index replies\_post\_idx on private.replies (post\_id, created\_at) where status = 'published';  
alter table private.posts add constraint posts\_answer\_fk  
foreign key (answered\_reply\_id) references private.replies(id) on delete set null;  
  
create table private.thread\_aliases (  
post\_id uuid not null references private.posts(id) on delete cascade,  
alias\_no integer not null,  
user\_id uuid references private.profiles(id) on delete set null,  
primary key (post\_id, alias\_no)  
);  
create unique index thread\_aliases\_user\_uq on private.thread\_aliases (post\_id, user\_id) where user\_id is not null;  
  
create table private.votes (  
user\_id uuid not null references private.profiles(id) on delete cascade,  
target\_type private.target\_type not null,  
target\_id uuid not null,  
value smallint not null check (value in (-1, 1)),  
created\_at timestamptz not null default now(),  
primary key (user\_id, target\_type, target\_id)  
);  
create index votes\_target\_idx on private.votes (target\_type, target\_id);  
  
\-- 006 safety and operations  
create table private.keyword\_rules (  
id bigint generated always as identity primary key,  
pattern text not null,  
match\_type text not null check (match\_type in ('contains','regex')),  
category text not null,  
is\_active boolean not null default true  
);  
  
create table private.reports (  
id bigint generated always as identity primary key,  
reporter\_id uuid references private.profiles(id) on delete set null,  
target\_type private.target\_type not null,  
target\_id uuid not null,  
reason private.report\_reason not null,  
note text check (char\_length(note) <= 300),  
status private.report\_status not null default 'open',  
created\_at timestamptz not null default now(),  
resolved\_by uuid references private.profiles(id) on delete set null,  
resolved\_at timestamptz,  
unique (reporter\_id, target\_type, target\_id)  
);  
create index reports\_open\_idx on private.reports (target\_type, target\_id) where status = 'open';  
  
create table private.moderation\_actions ( -- append-only  
id bigint generated always as identity primary key,  
actor\_id uuid references private.profiles(id) on delete set null,  
target\_type private.target\_type,  
target\_user\_ref uuid, -- set only for user-level actions  
target\_id uuid,  
action text not null check (action in ('restore','remove','warn','suspend','ban','unban','dismiss\_report')),  
reason text not null check (char\_length(reason) >= 5),  
created\_at timestamptz not null default now()  
);  
  
create table private.unmask\_requests (  
id bigint generated always as identity primary key,  
post\_id uuid not null,  
requested\_by uuid not null references private.profiles(id),  
approved\_by uuid references private.profiles(id),  
basis text not null check (basis in ('legal\_request','credible\_threat','upsa\_disciplinary\_referral')),  
reference text not null,  
reason text not null,  
status text not null default 'pending' check (status in ('pending','approved','rejected')),  
created\_at timestamptz not null default now(),  
decided\_at timestamptz,  
check (approved\_by is null or approved\_by <> requested\_by)  
);  
  
create table private.audit\_logs ( -- append-only  
id bigint generated always as identity primary key,  
actor\_id uuid,  
event text not null,  
metadata jsonb not null default '{}',  
created\_at timestamptz not null default now()  
);  
  
create table private.notifications (  
id bigint generated always as identity primary key,  
user\_id uuid not null references private.profiles(id) on delete cascade,  
type text not null, -- free text so new types need no migration  
payload jsonb not null default '{}', -- never contains author identity  
read\_at timestamptz,  
created\_at timestamptz not null default now()  
);  
create index notifications\_user\_idx on private.notifications (user\_id, created\_at desc);  
  
create table private.push\_subscriptions (  
id bigint generated always as identity primary key,  
user\_id uuid not null references private.profiles(id) on delete cascade,  
endpoint text not null unique,  
p256dh text not null,  
auth text not null,  
created\_at timestamptz not null default now()  
);  
  
create table private.data\_requests (  
id bigint generated always as identity primary key,  
user\_id uuid,  
type text not null check (type in ('access','correction')),  
details text,  
status text not null default 'open' check (status in ('open','in\_progress','completed','rejected')),  
requested\_at timestamptz not null default now(),  
due\_at timestamptz not null default now() + interval '30 days',  
completed\_at timestamptz  
);

5\. Functions
=============

Write functions are the only way clients change content. Each checks the signed-in user, the zone window and the content rules inside the database. Error codes are stable strings the API maps to client messages.  
\-- 007 helpers  
create function private.current\_zone() returns smallint  
language sql stable security definer set search\_path = private, public as $$  
select zone\_id from private.profiles  
where id = auth.uid() and status = 'active' and zone\_verified\_until > now();  
$$;  
  
create function private.screen\_text(p\_body text) returns private.content\_status  
language sql stable set search\_path = private, public as $$  
select case when exists (  
select 1 from private.keyword\_rules r  
where r.is\_active and (  
(r.match\_type = 'contains' and position(lower(r.pattern) in lower(p\_body)) > 0) or  
(r.match\_type = 'regex' and p\_body ~\* r.pattern))  
) then 'held'::private.content\_status else 'published'::private.content\_status end;  
$$;  
  
\-- 008 write functions (the only way clients change content)  
create function feed.create\_post(p\_channel smallint, p\_kind private.post\_kind, p\_body text)  
returns table (post\_id uuid, post\_status private.content\_status)  
language plpgsql security definer set search\_path = private, public as $$  
declare  
v\_uid uuid := auth.uid();  
v\_zone smallint := private.current\_zone();  
v\_body text := btrim(p\_body);  
v\_status private.content\_status;  
v\_id uuid;  
begin  
if v\_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;  
if v\_zone is null then raise exception 'zone\_not\_verified' using errcode = 'P0001'; end if;  
if not exists (select 1 from private.channels c  
where c.id = p\_channel and c.is\_active and (p\_kind = 'post' or c.allows\_ask)) then  
raise exception 'invalid\_channel' using errcode = 'P0001';  
end if;  
v\_status := private.screen\_text(v\_body);  
insert into private.posts (zone\_id, channel\_id, author\_id, kind, body, status)  
values (v\_zone, p\_channel, v\_uid, p\_kind, v\_body, v\_status)  
returning posts.id into v\_id;  
insert into private.thread\_aliases (post\_id, alias\_no, user\_id) values (v\_id, 0, v\_uid); -- OP  
return query select v\_id, v\_status;  
end $$;  
  
create function feed.create\_reply(p\_post uuid, p\_body text)  
returns table (reply\_id uuid, reply\_status private.content\_status, reply\_alias integer)  
language plpgsql security definer set search\_path = private, public as $$  
declare  
v\_uid uuid := auth.uid();  
v\_zone smallint := private.current\_zone();  
v\_body text := btrim(p\_body);  
v\_alias integer;  
v\_status private.content\_status;  
v\_id uuid;  
begin  
if v\_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;  
if v\_zone is null then raise exception 'zone\_not\_verified' using errcode = 'P0001'; end if;  
\-- the row lock serialises first replies so two people never get the same alias number  
perform 1 from private.posts p  
where p.id = p\_post and p.zone\_id = v\_zone and p.status = 'published' for update;  
if not found then raise exception 'post\_unavailable' using errcode = 'P0001'; end if;  
select ta.alias\_no into v\_alias from private.thread\_aliases ta  
where ta.post\_id = p\_post and ta.user\_id = v\_uid;  
if v\_alias is null then  
select coalesce(max(ta.alias\_no), 0) + 1 into v\_alias from private.thread\_aliases ta where ta.post\_id = p\_post;  
insert into private.thread\_aliases (post\_id, alias\_no, user\_id) values (p\_post, v\_alias, v\_uid);  
end if;  
v\_status := private.screen\_text(v\_body);  
insert into private.replies (post\_id, author\_id, alias\_no, body, status)  
values (p\_post, v\_uid, v\_alias, v\_body, v\_status)  
returning replies.id into v\_id;  
return query select v\_id, v\_status, v\_alias;  
end $$;  
  
create function feed.cast\_vote(p\_type private.target\_type, p\_target uuid, p\_value smallint)  
returns void  
language plpgsql security definer set search\_path = private, public as $$  
declare  
v\_uid uuid := auth.uid();  
v\_zone smallint := private.current\_zone();  
v\_author uuid;  
begin  
if v\_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;  
if v\_zone is null then raise exception 'zone\_not\_verified' using errcode = 'P0001'; end if;  
if p\_value not in (-1, 0, 1) then raise exception 'invalid\_vote' using errcode = 'P0001'; end if;  
if p\_type = 'post' then  
select p.author\_id into v\_author from private.posts p  
where p.id = p\_target and p.zone\_id = v\_zone and p.status = 'published';  
else  
select r.author\_id into v\_author from private.replies r  
join private.posts p on p.id = r.post\_id  
where r.id = p\_target and p.zone\_id = v\_zone and r.status = 'published';  
end if;  
if not found then raise exception 'target\_unavailable' using errcode = 'P0001'; end if;  
if v\_author = v\_uid then raise exception 'own\_content' using errcode = 'P0001'; end if;  
if p\_value = 0 then  
delete from private.votes where user\_id = v\_uid and target\_type = p\_type and target\_id = p\_target;  
else  
insert into private.votes (user\_id, target\_type, target\_id, value)  
values (v\_uid, p\_type, p\_target, p\_value)  
on conflict (user\_id, target\_type, target\_id) do update set value = excluded.value;  
end if;  
end $$;  
  
create function feed.report\_content(p\_type private.target\_type, p\_target uuid,  
p\_reason private.report\_reason, p\_note text default null)  
returns void  
language plpgsql security definer set search\_path = private, public as $$  
declare  
v\_uid uuid := auth.uid();  
v\_all int;  
v\_priority int;  
begin  
if v\_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;  
insert into private.reports (reporter\_id, target\_type, target\_id, reason, note)  
values (v\_uid, p\_type, p\_target, p\_reason, left(p\_note, 300))  
on conflict (reporter\_id, target\_type, target\_id) do nothing;  
select count(distinct r.reporter\_id),  
count(distinct r.reporter\_id) filter (where r.reason in ('self\_harm','threat\_of\_violence','doxxing'))  
into v\_all, v\_priority  
from private.reports r  
where r.target\_type = p\_type and r.target\_id = p\_target and r.status = 'open';  
if v\_priority >= 2 or v\_all >= 5 then  
if p\_type = 'post' then  
update private.posts set status = 'hidden', hidden\_reason = 'reports' where id = p\_target and status = 'published';  
else  
update private.replies set status = 'hidden' where id = p\_target and status = 'published';  
end if;  
end if;  
end $$;  
  
\-- 009 read functions  
create function feed.list\_posts\_new(p\_channel smallint default null, p\_kind private.post\_kind default null,  
p\_before\_ts timestamptz default null, p\_before\_id uuid default null,  
p\_limit integer default 20)  
returns table (id uuid, channel\_id smallint, kind private.post\_kind, body text, score integer,  
reply\_count integer, answered boolean, created\_at timestamptz, is\_mine boolean, my\_vote smallint)  
language plpgsql stable security definer set search\_path = private, public as $$  
declare v\_zone smallint := private.current\_zone();  
begin  
if v\_zone is null then raise exception 'zone\_not\_verified' using errcode = 'P0001'; end if;  
return query  
select p.id, p.channel\_id, p.kind, p.body, p.score, p.reply\_count,  
(p.answered\_reply\_id is not null), p.created\_at, (p.author\_id = auth.uid()),  
coalesce((select v.value from private.votes v  
where v.user\_id = auth.uid() and v.target\_type = 'post' and v.target\_id = p.id), 0)::smallint  
from private.posts p  
where p.zone\_id = v\_zone and p.status = 'published'  
and (p\_channel is null or p.channel\_id = p\_channel)  
and (p\_kind is null or p.kind = p\_kind)  
and (p\_before\_ts is null or (p.created\_at, p.id) < (p\_before\_ts, p\_before\_id))  
order by p.created\_at desc, p.id desc  
limit least(p\_limit, 50);  
end $$;  
\-- feed.list\_posts\_hot has the same shape: order by hot\_score desc, id desc and a (hot\_score, id) cursor.  
\-- feed.list\_posts\_top24 orders by score desc among posts from the last 24 hours.  
\-- feed.get\_thread returns the post and its published replies with alias\_no, never author\_id.  
  
create view feed.channels\_public as  
select id, slug, name, description, icon, sort\_order, allows\_ask  
from private.channels where is\_active order by sort\_order;

6\. Triggers
============

\-- 010 triggers  
create function private.apply\_vote() returns trigger  
language plpgsql security definer set search\_path = private, public as $$  
declare  
du int := 0; dd int := 0;  
t private.target\_type; tid uuid; v\_author uuid;  
begin  
if tg\_op in ('INSERT','UPDATE') then  
t := new.target\_type; tid := new.target\_id;  
if new.value = 1 then du := du + 1; else dd := dd + 1; end if;  
end if;  
if tg\_op in ('UPDATE','DELETE') then  
t := old.target\_type; tid := old.target\_id;  
if old.value = 1 then du := du - 1; else dd := dd - 1; end if;  
end if;  
if t = 'post' then  
update private.posts set upvotes = upvotes + du, downvotes = downvotes + dd  
where id = tid returning author\_id into v\_author;  
else  
update private.replies set upvotes = upvotes + du, downvotes = downvotes + dd  
where id = tid returning author\_id into v\_author;  
end if;  
if v\_author is not null then  
update private.profiles set karma = karma + (du - dd) where id = v\_author;  
end if;  
return null;  
end $$;  
create trigger votes\_apply after insert or update or delete on private.votes  
for each row execute function private.apply\_vote();  
  
create function private.auto\_hide\_post() returns trigger  
language plpgsql set search\_path = private, public as $$  
begin  
if new.status = 'published' and (new.upvotes - new.downvotes) <= -5 then  
new.status := 'hidden';  
new.hidden\_reason := 'score';  
end if;  
return new;  
end $$;  
create trigger posts\_auto\_hide before update of upvotes, downvotes on private.posts  
for each row execute function private.auto\_hide\_post();  
  
create function private.sync\_reply\_count() returns trigger  
language plpgsql security definer set search\_path = private, public as $$  
declare v\_post uuid := coalesce(new.post\_id, old.post\_id);  
begin  
update private.posts  
set reply\_count = (select count(\*) from private.replies r where r.post\_id = v\_post and r.status = 'published'),  
last\_activity\_at = now()  
where id = v\_post;  
return null;  
end $$;  
create trigger replies\_sync after insert or update of status or delete on private.replies  
for each row execute function private.sync\_reply\_count();  
  
create function private.block\_mutation() returns trigger  
language plpgsql as $$ begin raise exception 'append\_only' using errcode = 'P0001'; end $$;  
create trigger moderation\_actions\_append\_only before update or delete on private.moderation\_actions  
for each row execute function private.block\_mutation();  
create trigger audit\_logs\_append\_only before update or delete on private.audit\_logs  
for each row execute function private.block\_mutation();

<table><tbody><tr><td><strong>Known behaviour </strong>A post restored by a moderator after an auto-hide stays published until its next vote change, because the auto-hide trigger fires only on vote count updates. If that proves noisy, add a moderator override column before launch.</td></tr></tbody></table>

7\. Security, scheduled jobs and retention
==========================================

7.1 Access control
------------------

\-- 011 deny by default: RLS on every table in private, no policies for client roles  
do $$  
declare t record;  
begin  
for t in select tablename from pg\_tables where schemaname = 'private' loop  
execute format('alter table private.%I enable row level security', t.tablename);  
end loop;  
end $$;  
revoke all on all tables in schema private from anon, authenticated;  
revoke all on all functions in schema private from public, anon, authenticated;  
  
\-- 012 clients may only call the feed functions, and only when signed in  
revoke all on all functions in schema feed from public, anon;  
grant usage on schema feed to authenticated;  
grant execute on function  
feed.create\_post(smallint, private.post\_kind, text),  
feed.create\_reply(uuid, text),  
feed.cast\_vote(private.target\_type, uuid, smallint),  
feed.report\_content(private.target\_type, uuid, private.report\_reason, text),  
feed.list\_posts\_new(smallint, private.post\_kind, timestamptz, uuid, integer)  
to authenticated;  
grant select on feed.channels\_public to authenticated;  
\-- Only the server (service role) writes zone\_id / zone\_verified\_until, devices, consents, admin actions.

7.2 Scheduled jobs
------------------

\-- 013 scheduled jobs  
select cron.schedule('hot-score', '\* \* \* \* \*', $$  
update private.posts  
set hot\_score = (greatest(score, 0) + 1) / power(extract(epoch from (now() - created\_at)) / 3600 + 2, 1.5)  
where status = 'published' and created\_at > now() - interval '72 hours'  
$$);  
  
select cron.schedule('unsuspend', '\*/10 \* \* \* \*', $$  
update private.profiles set status = 'active', status\_until = null  
where status = 'suspended' and status\_until <= now()  
$$);  
  
create function private.run\_retention() returns void  
language plpgsql security definer set search\_path = private, public as $$  
begin  
update private.posts set status = 'archived', archived\_at = now()  
where status in ('published','hidden') and created\_at < now() - interval '30 days';  
delete from private.posts  
where status in ('removed','archived') and coalesce(archived\_at, created\_at) < now() - interval '12 months';  
delete from private.notifications where created\_at < now() - interval '60 days';  
delete from private.reports where status <> 'open' and created\_at < now() - interval '24 months';  
delete from private.consents c using private.deletion\_log d  
where c.user\_id = d.user\_id and d.deleted\_at < now() - interval '24 months';  
delete from private.deletion\_log where deleted\_at < now() - interval '24 months';  
end $$;  
select cron.schedule('retention', '30 2 \* \* \*', 'select private.run\_retention()');

7.3 Retention schedule
----------------------

| **Data** | **Retention** | **Mechanism** |
| --- | --- | --- |
| Published posts and replies | Readable 30 days, then archived | run\_retention (daily) |
| Removed and archived content | Deleted 12 months after archive or creation | run\_retention |
| Notifications | 60 days | run\_retention |
| Closed reports | 24 months | run\_retention |
| Consent records of deleted accounts | 24 months after deletion | run\_retention |
| Moderation actions and audit logs | Kept; reviewed annually | Append-only; manual review |
| Data requests | 24 months after completion | Manual until volume warrants a job |
| Backups | Provider and nightly dump retention, oldest purged within 35 days \[to confirm\] | Backup policy in Workflow document |

All periods are starting proposals \[DECISION D8\] and must match the Privacy Notice exactly. Whatever the notice states is what the jobs must do.

8\. Seed data
=============

\-- 014 seed (admin can change later)  
insert into private.channels (slug, name, description, icon, sort\_order, allows\_ask) values  
('academics', 'Academics', 'Courses, registration, lecturers (be fair), study tips', 'book', 1, true),  
('hostels', 'Hostels & Housing','Rooms, rent, roommates, safety around campus', 'home', 2, true),  
('food', 'Food & Chop', 'Where to eat, prices, deals', 'utensils', 3, true),  
('lost-found', 'Lost & Found', 'Lost something? Found something?', 'search', 4, false),  
('events', 'Events', 'Programmes, clubs, venue changes', 'calendar', 5, false),  
('random', 'Random', 'Everything else, within the rules', 'chat', 6, true);  
insert into private.keyword\_rules (pattern, match\_type, category) values  
('(\\+?233|0)\[235\]\[0-9\]{8}', 'regex', 'phone\_number\_doxxing'),  
('exam questions for sale', 'contains', 'exam\_leak');  
\-- Starter rules only. The full list is written with moderators and reviewed each exam period.  
Zone polygon rows are inserted from a surveyed boundary through the admin tool, not from SQL here \[D3\]. Allowed email domains are set at deployment \[D2\]. Legal document versions are inserted when the pages are published.

9\. Database tests that must pass before launch
===============================================

| **Test** | **Expected result** |
| --- | --- |
| As authenticated, select \* from private.posts | Permission denied |
| As authenticated, call feed.list\_posts\_new with no zone window | Error zone\_not\_verified |
| Result columns of every feed function | No author\_id, user\_id or email in any output |
| Create post then reply from two users concurrently, 50 times | Alias numbers unique and contiguous per thread |
| Same user replies twice in a thread | Same alias number both times |
| Same user replies in two different threads | Alias numbers independent of each other |
| Vote up, switch to down, remove | Counts and karma return to the starting values |
| Vote on own post | Error own\_content |
| Five net downvotes on a post | Post becomes hidden with reason score |
| Two priority reports from different users | Item becomes hidden |
| Update or delete a moderation action | Error append\_only |
| Delete a profile | Posts remain with author\_id null; votes removed and counts corrected; thread aliases keep numbers |
| Insert a second trusted device for one user | Unique violation |
| Run retention on seeded old data | Rows removed exactly per schedule |

10\. Data dictionary notes
==========================

| **Field** | **Notes** |
| --- | --- |
| profiles.zone\_verified\_until | Written by the server after a successful position check. The only location-related data stored. |
| profiles.karma | Net votes received; visible only to the owner through a self-summary function |
| devices.device\_hash | HMAC with a server pepper; the raw token lives only on the device |
| posts.hot\_score | Maintained by cron; never trusted for display |
| posts.hidden\_reason | score, reports or a moderation note category; shown to the author only as a neutral label |
| replies.alias\_no | 0 means OP; presentation as OP or Student n is done by the client |
| reports.note | Free text up to 300 characters; treat as untrusted input and render as plain text |
| notifications.payload | May contain alias numbers and snippets; must never contain author identity |
| unmask\_requests | Feature disabled until policy approval; constraint enforces two different people |

11\. Not in this schema (deliberately)
======================================

*   No table of coordinates, IP addresses or user agents.
*   No direct messages, media or follows in Phase 1.
*   No separate admin user table: admin rights are flags on profiles, consistent with the two-role model.
*   No materialised views or caches until measurements show the need.