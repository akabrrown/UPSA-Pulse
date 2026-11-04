-- 011 deny by default: RLS on every table in private, no policies for client roles
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
  end loop;
end $$;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

