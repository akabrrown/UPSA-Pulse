-- 010 triggers
create function private.apply_vote() returns trigger
language plpgsql security definer set search_path = private, public as $$
declare
  du int := 0; dd int := 0;
  t private.target_type; tid uuid; v_author uuid;
begin
  if tg_op in ('INSERT','UPDATE') then
    t := new.target_type; tid := new.target_id;
    if new.value = 1 then du := du + 1; else dd := dd + 1; end if;
  end if;
  if tg_op in ('UPDATE','DELETE') then
    t := old.target_type; tid := old.target_id;
    if old.value = 1 then du := du - 1; else dd := dd - 1; end if;
  end if;
  if t = 'post' then
    update private.posts set upvotes = upvotes + du, downvotes = downvotes + dd
    where id = tid returning author_id into v_author;
  else
    update private.replies set upvotes = upvotes + du, downvotes = downvotes + dd
    where id = tid returning author_id into v_author;
  end if;
  if v_author is not null then
    update private.profiles set karma = karma + (du - dd) where id = v_author;
  end if;
  return null;
end $$;
create trigger votes_apply after insert or update or delete on private.votes
  for each row execute function private.apply_vote();

create function private.auto_hide_post() returns trigger
language plpgsql set search_path = private, public as $$
begin
  if new.status = 'published' and (new.upvotes - new.downvotes) <= -5 then
    new.status := 'hidden';
    new.hidden_reason := 'score';
  end if;
  return new;
end $$;
create trigger posts_auto_hide before update of upvotes, downvotes on private.posts
  for each row execute function private.auto_hide_post();

create function private.sync_reply_count() returns trigger
language plpgsql security definer set search_path = private, public as $$
declare v_post uuid := coalesce(new.post_id, old.post_id);
begin
  update private.posts
  set reply_count = (select count(*) from private.replies r where r.post_id = v_post and r.status = 'published'),
      last_activity_at = now()
  where id = v_post;
  return null;
end $$;
create trigger replies_sync after insert or update of status or delete on private.replies
  for each row execute function private.sync_reply_count();

create function private.block_mutation() returns trigger
language plpgsql as $$ begin raise exception 'append_only' using errcode = 'P0001'; end $$;
create trigger moderation_actions_append_only before update or delete on private.moderation_actions
  for each row execute function private.block_mutation();
create trigger audit_logs_append_only before update or delete on private.audit_logs
  for each row execute function private.block_mutation();

