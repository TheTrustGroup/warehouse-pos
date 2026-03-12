-- Drop all conflicting BEFORE triggers on warehouse_inventory_by_size
DROP TRIGGER IF EXISTS trg_enforce_size_policy_insupd 
  ON warehouse_inventory_by_size;
DROP TRIGGER IF EXISTS trg_enforce_size_rules 
  ON warehouse_inventory_by_size;
DROP TRIGGER IF EXISTS trg_normalize_size_code 
  ON warehouse_inventory_by_size;
DROP TRIGGER IF EXISTS trg_wibs_enforce_size_kind 
  ON warehouse_inventory_by_size;

-- Drop associated functions
DROP FUNCTION IF EXISTS fn_enforce_size_policy_insupd() CASCADE;
DROP FUNCTION IF EXISTS fn_enforce_size_rules() CASCADE;
DROP FUNCTION IF EXISTS fn_normalize_size_code() CASCADE;
DROP FUNCTION IF EXISTS fn_wibs_enforce_size_kind() CASCADE;

-- Single replacement: just uppercase the size_code on write
CREATE OR REPLACE FUNCTION fn_normalize_size_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.size_code IS NOT NULL THEN
    NEW.size_code := upper(trim(NEW.size_code));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_size_code
BEFORE INSERT OR UPDATE ON warehouse_inventory_by_size
FOR EACH ROW EXECUTE FUNCTION fn_normalize_size_code();
