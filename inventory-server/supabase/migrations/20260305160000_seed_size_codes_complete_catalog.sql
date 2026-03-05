-- Data integrity: ensure every size code the UI or API can send exists in size_codes.
-- The trigger enforce_size_rules requires size_code to exist here; missing codes cause "invalid size code".
-- This migration is idempotent: uses ON CONFLICT DO UPDATE so re-runs are safe.
-- Uses only columns that exist in all deploy paths (size_code, size_label, size_order).

-- Ensure size_order exists (some setups have sort_order only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'size_codes' AND column_name = 'size_order'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'size_codes' AND column_name = 'sort_order'
    ) THEN
      ALTER TABLE public.size_codes ADD COLUMN size_order integer NOT NULL DEFAULT 0;
      UPDATE public.size_codes SET size_order = sort_order;
    ELSE
      ALTER TABLE public.size_codes ADD COLUMN size_order integer NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;

-- Single source of truth: full catalog so any valid user entry (after normalize: uppercase, no spaces) is allowed.
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('NA', 'N/A', -100),
  ('OS', 'One Size', -99),
  ('ONE_SIZE', 'One Size', -98)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- Adult apparel letter
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('XXS', 'XXS', 19),
  ('XS', 'XS', 20),
  ('S', 'S', 21),
  ('M', 'M', 22),
  ('L', 'L', 23),
  ('XL', 'XL', 24),
  ('XXL', 'XXL', 25),
  ('2XL', '2XL', 26),
  ('3XL', '3XL', 27),
  ('4XL', '4XL', 28),
  ('5XL', '5XL', 29)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- Adult US footwear
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('US5', 'US 5', 9),
  ('US6', 'US 6', 10),
  ('US7', 'US 7', 11),
  ('US8', 'US 8', 12),
  ('US9', 'US 9', 13),
  ('US10', 'US 10', 14),
  ('US11', 'US 11', 15),
  ('US12', 'US 12', 16),
  ('US13', 'US 13', 17),
  ('US14', 'US 14', 18),
  ('US15', 'US 15', 19)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- EU footwear (kids through adult)
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('EU20', 'EU 20', 67),
  ('EU21', 'EU 21', 68),
  ('EU22', 'EU 22', 69),
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
  ('EU37', 'EU 37', 84),
  ('EU38', 'EU 38', 85),
  ('EU39', 'EU 39', 86),
  ('EU40', 'EU 40', 87),
  ('EU41', 'EU 41', 88),
  ('EU42', 'EU 42', 89),
  ('EU43', 'EU 43', 90),
  ('EU44', 'EU 44', 91),
  ('EU45', 'EU 45', 92),
  ('EU46', 'EU 46', 93),
  ('EU47', 'EU 47', 94),
  ('EU48', 'EU 48', 95),
  ('EU49', 'EU 49', 96),
  ('EU50', 'EU 50', 97)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- UK footwear
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('UK3', 'UK 3', 100),
  ('UK4', 'UK 4', 101),
  ('UK5', 'UK 5', 102),
  ('UK6', 'UK 6', 103),
  ('UK7', 'UK 7', 104),
  ('UK8', 'UK 8', 105),
  ('UK9', 'UK 9', 106),
  ('UK10', 'UK 10', 107),
  ('UK11', 'UK 11', 108),
  ('UK12', 'UK 12', 109),
  ('UK13', 'UK 13', 110)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- Waist
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('W28', 'W28', 30),
  ('W30', 'W30', 31),
  ('W32', 'W32', 32),
  ('W34', 'W34', 33),
  ('W36', 'W36', 34),
  ('W38', 'W38', 35),
  ('W40', 'W40', 36)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- Infant (months)
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('0-3M', '0-3 M', 40),
  ('3-6M', '3-6 M', 41),
  ('6-9M', '6-9 M', 42),
  ('9-12M', '9-12 M', 43),
  ('12-18M', '12-18 M', 44),
  ('18-24M', '18-24 M', 45)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- Toddler
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('2T', '2T', 46),
  ('3T', '3T', 47),
  ('4T', '4T', 48),
  ('5T', '5T', 49),
  ('6T', '6T', 50),
  ('7T', '7T', 51),
  ('8T', '8T', 52)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- Kids footwear (US)
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('US1K', 'US 1 (Kids)', 53),
  ('US2K', 'US 2 (Kids)', 54),
  ('US3K', 'US 3 (Kids)', 55),
  ('US4K', 'US 4 (Kids)', 56),
  ('US5K', 'US 5 (Kids)', 57),
  ('US6K', 'US 6 (Kids)', 58),
  ('US7K', 'US 7 (Kids)', 59),
  ('US8K', 'US 8 (Kids)', 60),
  ('US9K', 'US 9 (Kids)', 61),
  ('US10K', 'US 10 (Kids)', 62),
  ('US11K', 'US 11 (Kids)', 63),
  ('US12K', 'US 12 (Kids)', 64),
  ('US13K', 'US 13 (Kids)', 65)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- Youth clothing (Y and numeric)
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('6Y', '6Y', 66),
  ('8Y', '8Y', 67),
  ('10Y', '10Y', 68),
  ('12Y', '12Y', 69),
  ('14Y', '14Y', 70),
  ('10', '10', 71),
  ('12', '12', 72),
  ('14', '14', 73),
  ('16', '16', 74),
  ('18', '18', 75),
  ('20', '20', 76)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;

-- EU kids (common in setup.sql / docs)
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('EU16', 'EU 16', 1),
  ('EU17', 'EU 17', 2),
  ('EU18', 'EU 18', 3),
  ('EU19', 'EU 19', 4)
ON CONFLICT (size_code) DO UPDATE SET size_label = EXCLUDED.size_label, size_order = EXCLUDED.size_order;
