-- 013 scheduled jobs
select cron.schedule('hot-score', '* * * * *', $$
  update private.posts
  set hot_score = (greatest(score, 0) + 1) / power(extract(epoch from (now() - created_at)) / 3600 + 2, 1.5)
  where status = 'published' and created_at > now() - interval '72 hours'
$$);

select cron.schedule('unsuspend', '*/10 * * * *', $$
  update private.profiles set status = 'active', status_until = null
  where status = 'suspended' and status_until <= now()
$$);

create function private.run_retention() returns void
language plpgsql security definer set search_path = private, public as $$
begin
  update private.posts set status = 'archived', archived_at = now()
  where status in ('published','hidden') and created_at < now() - interval '30 days';
  delete from private.posts
  where status in ('removed','archived') and coalesce(archived_at, created_at) < now() - interval '12 months';
  delete from private.notifications where created_at < now() - interval '60 days';
  delete from private.reports where status <> 'open' and created_at < now() - interval '24 months';
  delete from private.consents c using private.deletion_log d
  where c.user_id = d.user_id and d.deleted_at < now() - interval '24 months';
  delete from private.deletion_log where deleted_at < now() - interval '24 months';
end $$;
select cron.schedule('retention', '30 2 * * *', 'select private.run_retention()');

