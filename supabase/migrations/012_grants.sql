-- 012 clients may only call the feed functions, and only when signed in
revoke all on all functions in schema feed from public, anon;
grant usage on schema feed to authenticated;
grant execute on function
  feed.create_post(smallint, private.post_kind, text),
  feed.create_reply(uuid, text),
  feed.cast_vote(private.target_type, uuid, smallint),
  feed.report_content(private.target_type, uuid, private.report_reason, text),
  feed.mark_answer(uuid),
  feed.delete_own_post(uuid),
  feed.record_consent(text, text),
  feed.submit_data_request(text, text),
  feed.mark_notifications_read(),
  feed.list_posts_new(smallint, private.post_kind, timestamptz, uuid, integer),
  feed.list_posts_hot(smallint, private.post_kind, double precision, uuid, integer),
  feed.list_posts_top24(smallint, private.post_kind, integer, uuid, integer),
  feed.get_thread(uuid),
  feed.get_my_profile(),
  feed.list_notifications(integer)
to authenticated;
grant select on feed.channels_public to authenticated;
-- Only the server (service role) writes zone_id / zone_verified_until, devices, admin actions.

