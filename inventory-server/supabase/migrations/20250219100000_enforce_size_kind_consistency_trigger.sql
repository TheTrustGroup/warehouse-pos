-- Align with Supabase briefing: strict size rules.
-- - size_kind = 'sized' → size_code must NOT be 'OS' (must be a catalog size like S, M, L, EU23–EU37).
-- - size_kind in ('na','one_size') → size_code must be 'OS'.
-- - size_code must exist in public.size_codes (catalog-only).

create or replace function public.enforce_size_rules()
returns trigger
language plpgsql
as $$
declare
  kind text;
  code_exists boolean;
begin
  select coalesce(size_kind, 'na') into kind
  from public.warehouse_products
  where id = NEW.product_id;

  -- Catalog-only: size_code must exist in size_codes
  select exists (select 1 from public.size_codes sc where sc.size_code = NEW.size_code) into code_exists;
  if not code_exists then
    raise exception 'size_code % does not exist in public.size_codes. Only catalog sizes are allowed.', NEW.size_code;
  end if;

  if kind = 'sized' then
    if NEW.size_code = 'OS' then
      raise exception 'Product % is sized; size_code must not be OS. Use a real size (e.g. S, M, L, EU23–EU37).', NEW.product_id;
    end if;
    return NEW;
  end if;

  -- na or one_size: only OS allowed
  if kind in ('na', 'one_size') and NEW.size_code <> 'OS' then
    raise exception 'Product % has size_kind %; size_code must be OS, got: %', NEW.product_id, kind, NEW.size_code;
  end if;

  return NEW;
end;
$$;

comment on function public.enforce_size_rules is 'Trigger: enforces size_kind vs size_code (OS only for na/one_size; no OS for sized) and validates size_code in size_codes.';

drop trigger if exists trg_enforce_size_kind on public.warehouse_inventory_by_size;
drop trigger if exists trg_enforce_size_rules on public.warehouse_inventory_by_size;
create trigger trg_enforce_size_rules
  before insert or update on public.warehouse_inventory_by_size
  for each row execute function public.enforce_size_rules();

-- Hardened product metadata: only allowed size_kind values
alter table public.warehouse_products
  drop constraint if exists warehouse_products_size_kind_check;
alter table public.warehouse_products
  add constraint warehouse_products_size_kind_check
  check (size_kind in ('na', 'one_size', 'sized'));
