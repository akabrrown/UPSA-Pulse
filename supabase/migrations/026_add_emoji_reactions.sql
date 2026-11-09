-- 026_add_emoji_reactions.sql
-- Adds emoji reaction support (🔥, 😂, ❤️, 💡, 👏, 😮) for posts with server-side authorization and idempotency.

create table if not exists private.post_reactions (
  post_id uuid not null references private.posts(id) on delete cascade,
  user_id uuid not null references private.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '😂', '❤️', '💡', '👏', '😮')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create index if not exists post_reactions_post_id_idx on private.post_reactions(post_id);
create index if not exists post_reactions_user_id_idx on private.post_reactions(user_id);

alter table private.post_reactions enable row level security;
revoke all on table private.post_reactions from public, anon, authenticated;

-- Function to toggle emoji reaction (idempotent toggle)
create or replace function feed.toggle_post_reaction(p_post uuid, p_emoji text)
returns table (emoji text, count bigint, reacted boolean)
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_emoji not in ('🔥', '😂', '❤️', '💡', '👏', '😮') then
    raise exception 'invalid_emoji' using errcode = 'P0001';
  end if;
  if not exists (select 1 from private.posts where id = p_post and status = 'published') then
    raise exception 'post_unavailable' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from private.post_reactions where post_id = p_post and user_id = v_uid and emoji = p_emoji
  ) into v_exists;

  if v_exists then
    delete from private.post_reactions where post_id = p_post and user_id = v_uid and emoji = p_emoji;
  else
    insert into private.post_reactions (post_id, user_id, emoji)
    values (p_post, v_uid, p_emoji)
    on conflict do nothing;
  end if;

  return query
  select
    p_emoji,
    (select count(*) from private.post_reactions r where r.post_id = p_post and r.emoji = p_emoji),
    not v_exists;
end $$;

grant execute on function feed.toggle_post_reaction(uuid, text) to authenticated;
