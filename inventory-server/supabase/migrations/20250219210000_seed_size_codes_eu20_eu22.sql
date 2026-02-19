-- Add EU20–EU22 to size_codes so product edit form with these sizes (e.g. kids EU22) does not fail enforce_size_rules trigger.
-- EU23–EU37 are already in 20250219200000_seed_size_codes_eu23_eu37.sql.

insert into size_codes (size_code, size_label, size_order) values
  ('EU20', 'EU 20', 67),
  ('EU21', 'EU 21', 68),
  ('EU22', 'EU 22', 69)
on conflict (size_code) do nothing;
