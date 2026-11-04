-- 007 helpers
create function private.current_zone() returns smallint
language sql stable security definer set search_path = private, public as $$
  select zone_id from private.profiles
  where id = auth.uid() and status = 'active' and zone_verified_until > now();
$$;

create function private.screen_text(p_body text) returns private.content_status
language sql stable set search_path = private, public as $$
  select case when exists (
    select 1 from private.keyword_rules r
    where r.is_active and (
      (r.match_type = 'contains' and position(lower(r.pattern) in lower(p_body)) > 0) or
      (r.match_type = 'regex' and p_body ~* r.pattern))
  ) then 'held'::private.content_status else 'published'::private.content_status end;
$$;

create function private.matched_keyword_category(p_body text) returns text
language sql stable set search_path = private, public as $$
  select r.category from private.keyword_rules r
  where r.is_active and (
    (r.match_type = 'contains' and position(lower(r.pattern) in lower(p_body)) > 0) or
    (r.match_type = 'regex' and p_body ~* r.pattern)
  )
  order by case when r.category = 'self_harm' then 0 else 1 end, r.id
  limit 1;
$$;

