-- =============================================================================
-- UPSA Pulse — Migration 020: Purge Mock Data & Start Live Real-Time Campus Feeds
-- =============================================================================

-- 1. Remove all mock posts, replies, thread aliases, reports, votes, and notifications
delete from private.notifications;
delete from private.reports;
delete from private.moderation_actions;
delete from private.unmask_requests;
delete from private.data_requests;
delete from private.appeals;
delete from private.votes;
delete from private.replies;
delete from private.thread_aliases;
delete from private.posts;
delete from private.password_reset_tokens;

-- 2. Reset karma to 0 on student profile records so all scores reflect live user activity
update private.profiles
set karma = 0,
    status = 'active',
    status_until = null;

-- 3. Enable REPLICA IDENTITY FULL for Supabase Realtime publication streams
alter table private.posts replica identity full;
alter table private.replies replica identity full;

-- 4. Enable Supabase Realtime publication on posts and replies if publication exists
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table private.posts, private.replies;
    exception when others then
      null;
    end;
  end if;
end $$;

