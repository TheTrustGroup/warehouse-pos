-- Seed size_codes with kid/toddler sizes (2T, 3T, 4T, etc.) so inventory recording
-- and size filter work for all sizes. Inserts only when size_code does not exist.
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'size_codes' AND column_name = 'size_order'
  ) THEN
    ALTER TABLE public.size_codes ADD COLUMN size_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Insert kid/toddler and common sizes only where they don't exist.
INSERT INTO public.size_codes (size_code, size_label, size_order)
SELECT v.code, v.label, v.ord
FROM (VALUES
  ('2T',  '2T',  10),
  ('3T',  '3T',  20),
  ('4T',  '4T',  30),
  ('5T',  '5T',  40),
  ('6T',  '6T',  50),
  ('7T',  '7T',  60),
  ('8T',  '8T',  70),
  ('10',  '10',  100),
  ('12',  '12',  110),
  ('14',  '14',  120),
  ('16',  '16',  130),
  ('18',  '18',  140),
  ('20',  '20',  150),
  ('NA',  'N/A', 0),
  ('OS',  'One size', 1),
  ('ONE_SIZE', 'One size', 2)
) AS v(code, label, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.size_codes sc WHERE sc.size_code = v.code);
