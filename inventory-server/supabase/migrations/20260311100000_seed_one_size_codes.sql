-- Ensure ONE_SIZE / ONESIZE exist in size_codes so by_size inserts never fail on FK
-- (20250211020000 drops the FK in some envs; this keeps legacy or re-FK envs working.)
insert into size_codes (size_code, size_label, size_order) values
  ('ONE_SIZE', 'One size', -98),
  ('ONESIZE', 'One size', -97)
on conflict (size_code) do update set size_label = excluded.size_label, size_order = excluded.size_order;
