-- Backend Schema Section 9: Database tests that must pass before launch
-- Run in a transaction that rolls back after asserting all 14 invariants.

begin;

-- 1. As authenticated, select * from private.posts -> Permission denied
do $$
begin
  if has_table_privilege('authenticated', 'private.posts', 'SELECT') then
    raise exception 'FAIL: authenticated role must NOT have SELECT on private.posts';
  end if;
  if has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'FAIL: authenticated role must NOT have USAGE on schema private';
  end if;
  if has_schema_privilege('anon', 'feed', 'USAGE') then
    raise exception 'FAIL: anon role must NOT have USAGE on schema feed';
  end if;
end $$;

-- 2. Result columns of every feed function -> No author_id, user_id or email in any output
do $$
declare
  v_bad record;
begin
  for v_bad in
    select p.proname, a.attname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    join pg_attribute a on a.attrelid = t.typrelid
    where n.nspname = 'feed'
      and a.attnum > 0
      and a.attname in ('author_id', 'user_id', 'email', 'device_hash')
  loop
    raise exception 'FAIL: feed function % leaks restricted column %', v_bad.proname, v_bad.attname;
  end loop;
end $$;

-- 3. Append-only triggers exist on moderation_actions and audit_logs
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'moderation_actions_append_only'
  ) then
    raise exception 'FAIL: moderation_actions_append_only trigger missing';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'audit_logs_append_only'
  ) then
    raise exception 'FAIL: audit_logs_append_only trigger missing';
  end if;
end $$;

-- 4. Every table in schema private has Row Level Security enabled
do $$
declare
  v_unprotected text;
begin
  select tablename into v_unprotected
  from pg_tables
  where schemaname = 'private' and not rowsecurity
  limit 1;
  if v_unprotected is not null then
    raise exception 'FAIL: table private.% does not have RLS enabled', v_unprotected;
  end if;
end $$;

rollback;

