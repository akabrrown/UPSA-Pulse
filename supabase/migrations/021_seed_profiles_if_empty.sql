-- 021: Ensure core campus profiles exist in private.profiles with valid zone window
insert into private.profiles (
  id, status, karma, zone_id, zone_verified_until, is_admin, can_moderate, can_unmask,
  adult_confirmed_at, username, index_number, auth_provider, index_verified_at
)
values
  ('11111111-1111-4111-8111-111111111111', 'active', 14, 1, now() + interval '365 days', false, false, false, now(), 'efua_upsa', '10284001', 'password', now()),
  ('22222222-2222-4222-8222-222222222222', 'active', 27, 1, now() + interval '365 days', false, false, false, now(), 'kojo_upsa', '10284002', 'password', now()),
  ('33333333-3333-4333-8333-333333333333', 'active',  9, 1, now() + interval '365 days', false, false, false, now(), 'ama_upsa', '10284003', 'password', now()),
  ('44444444-4444-4444-8444-444444444444', 'active',  5, 1, now() + interval '365 days', true,  true,  false, now(), 'moderator_upsa', '10284004', 'password', now()),
  ('55555555-5555-4555-8555-555555555555', 'active',  0, 1, now() + interval '365 days', true,  true,  true,  now(), 'holder_a', '10284005', 'password', now()),
  ('66666666-6666-4666-8666-666666666666', 'active',  0, 1, now() + interval '365 days', true,  true,  true,  now(), 'holder_b', '10284006', 'password', now())
on conflict (id) do update set
  zone_id = excluded.zone_id,
  zone_verified_until = excluded.zone_verified_until,
  is_admin = excluded.is_admin,
  can_moderate = excluded.can_moderate,
  can_unmask = excluded.can_unmask,
  username = coalesce(private.profiles.username, excluded.username),
  index_number = coalesce(private.profiles.index_number, excluded.index_number),
  auth_provider = coalesce(private.profiles.auth_provider, excluded.auth_provider),
  index_verified_at = coalesce(private.profiles.index_verified_at, excluded.index_verified_at);
