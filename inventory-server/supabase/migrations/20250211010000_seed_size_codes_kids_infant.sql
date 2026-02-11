-- Additive: seed kids and infant size codes so size_codes supports both kids and adult.
-- Safe to run after 20250211000000_size_codes_and_inventory_by_size.sql (on conflict do nothing).

-- Infant (months)
insert into size_codes (size_code, size_label, size_order) values
  ('0-3M', '0-3 M', 40),
  ('3-6M', '3-6 M', 41),
  ('6-9M', '6-9 M', 42),
  ('9-12M', '9-12 M', 43),
  ('12-18M', '12-18 M', 44),
  ('18-24M', '18-24 M', 45)
on conflict (size_code) do nothing;

-- Toddler (T sizes)
insert into size_codes (size_code, size_label, size_order) values
  ('2T', '2T', 46),
  ('3T', '3T', 47),
  ('4T', '4T', 48),
  ('5T', '5T', 49)
on conflict (size_code) do nothing;

-- Kids footwear (US kids 1-13)
insert into size_codes (size_code, size_label, size_order) values
  ('US1K', 'US 1 (Kids)', 50),
  ('US2K', 'US 2 (Kids)', 51),
  ('US3K', 'US 3 (Kids)', 52),
  ('US4K', 'US 4 (Kids)', 53),
  ('US5K', 'US 5 (Kids)', 54),
  ('US6K', 'US 6 (Kids)', 55),
  ('US7K', 'US 7 (Kids)', 56),
  ('US8K', 'US 8 (Kids)', 57),
  ('US9K', 'US 9 (Kids)', 58),
  ('US10K', 'US 10 (Kids)', 59),
  ('US11K', 'US 11 (Kids)', 60),
  ('US12K', 'US 12 (Kids)', 61),
  ('US13K', 'US 13 (Kids)', 62)
on conflict (size_code) do nothing;

-- Youth clothing (numeric)
insert into size_codes (size_code, size_label, size_order) values
  ('6Y', '6Y', 63),
  ('8Y', '8Y', 64),
  ('10Y', '10Y', 65),
  ('12Y', '12Y', 66),
  ('14Y', '14Y', 67)
on conflict (size_code) do nothing;
