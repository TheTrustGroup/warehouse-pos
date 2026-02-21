-- Add missing toddler clothing sizes (6T, 7T, 8T) so "Invalid size_code 6T (not present in size_codes)" is resolved.
-- warehouse_inventory_by_size.size_code references size_codes(size_code); inserts fail if code is missing.
-- Safe to run multiple times (on conflict do nothing).

insert into size_codes (size_code, size_label, size_order) values
  ('6T', '6T', 50),
  ('7T', '7T', 51),
  ('8T', '8T', 52)
on conflict (size_code) do nothing;
