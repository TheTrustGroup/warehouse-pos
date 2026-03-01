-- Big-brand full size catalog: apparel (all letter sizes including 2XL–5XL), extended toddler,
-- extended US/EU/UK footwear, extended waist. All size_code values must exist in size_codes
-- for enforce_size_rules trigger (catalog-only). Safe: on conflict do nothing.
-- Uses sort_order (and size_group when present) to match setup.sql / deployed schema.

-- Apparel: XXS (optional), 2XL–5XL (UI/common use; XXL already exists)
insert into size_codes (size_code, size_label, size_group, sort_order) values
  ('XXS', 'XXS', 'apparel', 19),
  ('2XL', '2XL', 'apparel', 26),
  ('3XL', '3XL', 'apparel', 27),
  ('4XL', '4XL', 'apparel', 28),
  ('5XL', '5XL', 'apparel', 29)
on conflict (size_code) do update set size_label = excluded.size_label, size_group = excluded.size_group, sort_order = excluded.sort_order;

-- Toddler: 6T, 7T, 8T (after 2T–5T)
insert into size_codes (size_code, size_label, size_group, sort_order) values
  ('6T', '6T', 'toddler', 495),
  ('7T', '7T', 'toddler', 496),
  ('8T', '8T', 'toddler', 497)
on conflict (size_code) do update set size_label = excluded.size_label, size_group = excluded.size_group, sort_order = excluded.sort_order;

-- Adult US footwear: extend range (US5, US14, US15)
insert into size_codes (size_code, size_label, size_group, sort_order) values
  ('US5', 'US 5', 'footwear_us', 9),
  ('US14', 'US 14', 'footwear_us', 18),
  ('US15', 'US 15', 'footwear_us', 19)
on conflict (size_code) do update set size_label = excluded.size_label, size_group = excluded.size_group, sort_order = excluded.sort_order;

-- EU footwear: extend to EU38–EU50 (adult sneakers/shoes)
insert into size_codes (size_code, size_label, size_group, sort_order) values
  ('EU38', 'EU 38', 'footwear_eu', 85),
  ('EU39', 'EU 39', 'footwear_eu', 86),
  ('EU40', 'EU 40', 'footwear_eu', 87),
  ('EU41', 'EU 41', 'footwear_eu', 88),
  ('EU42', 'EU 42', 'footwear_eu', 89),
  ('EU43', 'EU 43', 'footwear_eu', 90),
  ('EU44', 'EU 44', 'footwear_eu', 91),
  ('EU45', 'EU 45', 'footwear_eu', 92),
  ('EU46', 'EU 46', 'footwear_eu', 93),
  ('EU47', 'EU 47', 'footwear_eu', 94),
  ('EU48', 'EU 48', 'footwear_eu', 95),
  ('EU49', 'EU 49', 'footwear_eu', 96),
  ('EU50', 'EU 50', 'footwear_eu', 97)
on conflict (size_code) do update set size_label = excluded.size_label, size_group = excluded.size_group, sort_order = excluded.sort_order;

-- UK footwear: UK3–UK13 (common for sneakers/shoes)
insert into size_codes (size_code, size_label, size_group, sort_order) values
  ('UK3', 'UK 3', 'footwear_uk', 100),
  ('UK4', 'UK 4', 'footwear_uk', 101),
  ('UK5', 'UK 5', 'footwear_uk', 102),
  ('UK6', 'UK 6', 'footwear_uk', 103),
  ('UK7', 'UK 7', 'footwear_uk', 104),
  ('UK8', 'UK 8', 'footwear_uk', 105),
  ('UK9', 'UK 9', 'footwear_uk', 106),
  ('UK10', 'UK 10', 'footwear_uk', 107),
  ('UK11', 'UK 11', 'footwear_uk', 108),
  ('UK12', 'UK 12', 'footwear_uk', 109),
  ('UK13', 'UK 13', 'footwear_uk', 110)
on conflict (size_code) do update set size_label = excluded.size_label, size_group = excluded.size_group, sort_order = excluded.sort_order;

-- Waist: W38, W40 (extended)
insert into size_codes (size_code, size_label, size_group, sort_order) values
  ('W38', 'W38', 'waist', 35),
  ('W40', 'W40', 'waist', 36)
on conflict (size_code) do update set size_label = excluded.size_label, size_group = excluded.size_group, sort_order = excluded.sort_order;
