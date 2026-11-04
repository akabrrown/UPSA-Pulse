-- 014 seed (admin can change later)
insert into private.channels (slug, name, description, icon, sort_order, allows_ask) values
  ('academics', 'Academics', 'Courses, registration, lecturers (be fair), study tips', 'book', 1, true),
  ('hostels', 'Hostels & Housing', 'Rooms, rent, roommates, safety around campus', 'home', 2, true),
  ('food', 'Food & Chop', 'Where to eat, prices, deals', 'utensils', 3, true),
  ('lost-found', 'Lost & Found', 'Lost something? Found something?', 'search', 4, false),
  ('events', 'Events', 'Programmes, clubs, venue changes', 'calendar', 5, false),
  ('random', 'Random', 'Everything else, within the rules', 'chat', 6, true);

insert into private.keyword_rules (pattern, match_type, category) values
  ('(\+?233|0)[235][0-9]{8}', 'regex', 'phone_number_doxxing'),
  ('exam questions for sale', 'contains', 'exam_leak'),
  ('kill myself|end my life|want to die|suicide', 'regex', 'self_harm');

insert into private.allowed_domains (domain, is_active) values
  ('upsa.edu.gh', true),
  ('st.upsa.edu.gh', true);

insert into private.legal_documents (document, version, effective_at, change_summary, is_current) values
  ('terms', '1.0', '2026-10-17T00:00:00Z', 'Initial release of UPSA Pulse Terms of Service.', true),
  ('privacy', '1.0', '2026-10-17T00:00:00Z', 'Initial release of UPSA Pulse Privacy Notice.', true),
  ('community_guidelines', '1.0', '2026-10-17T00:00:00Z', 'Initial release of UPSA Pulse Community Guidelines.', true);

-- Default UPSA Campus + Hostel Belt Polygon (Madina / Legon boundary around 5.660N, -0.166W) [D3]
insert into private.zones (name, boundary, max_accuracy_m, is_active) values (
  'UPSA Main Campus & Hostel Belt',
  ST_GeogFromText('SRID=4326;POLYGON((-0.1750 5.6520, -0.1580 5.6520, -0.1580 5.6690, -0.1750 5.6690, -0.1750 5.6520))'),
  150,
  true
);

