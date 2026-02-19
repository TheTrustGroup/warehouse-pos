-- Seed EU23–EU37 in size_codes (15 entries). Per Supabase briefing: catalog limited to EU23–EU37 for now.
-- Safe to run after size_codes exists (on conflict do nothing).

insert into size_codes (size_code, size_label, size_order) values
  ('EU23', 'EU 23', 70),
  ('EU24', 'EU 24', 71),
  ('EU25', 'EU 25', 72),
  ('EU26', 'EU 26', 73),
  ('EU27', 'EU 27', 74),
  ('EU28', 'EU 28', 75),
  ('EU29', 'EU 29', 76),
  ('EU30', 'EU 30', 77),
  ('EU31', 'EU 31', 78),
  ('EU32', 'EU 32', 79),
  ('EU33', 'EU 33', 80),
  ('EU34', 'EU 34', 81),
  ('EU35', 'EU 35', 82),
  ('EU36', 'EU 36', 83),
  ('EU37', 'EU 37', 84)
on conflict (size_code) do nothing;

comment on table size_codes is 'Reference: normalized size_code (e.g. US9, M, EU32). Includes EU23–EU37. One size = OS.';
