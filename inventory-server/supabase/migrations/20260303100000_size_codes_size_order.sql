-- Add size_order to size_codes for ordered size selector (GET /api/size-codes).
-- Safe if column already exists (IF NOT EXISTS not supported for columns in older PG; we use DO block).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'size_codes' AND column_name = 'size_order'
  ) THEN
    ALTER TABLE public.size_codes ADD COLUMN size_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;
