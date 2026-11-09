-- 024_add_deletion_reason.sql
-- Allow users to record an optional reason for account deletion

alter table private.deletion_log
  add column if not exists reason text;
