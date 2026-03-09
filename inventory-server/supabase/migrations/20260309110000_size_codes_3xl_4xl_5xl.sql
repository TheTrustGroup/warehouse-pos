-- Add 3XL, 4XL, 5XL so "Multiple sizes" with these codes don't get "Invalid size code" from the API.
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('3XL', '3XL', 26),
  ('4XL', '4XL', 27),
  ('5XL', '5XL', 28)
ON CONFLICT (size_code) DO NOTHING;
