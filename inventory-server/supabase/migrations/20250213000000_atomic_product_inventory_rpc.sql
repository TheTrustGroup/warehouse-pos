-- Atomic product + inventory writes. Prevents partial commits (product without inventory or orphaned by_size rows).
-- DATA DURABILITY: Either all of (warehouse_products, warehouse_inventory, warehouse_inventory_by_size) succeed or none do.

-- Create product + inventory + optional by_size in one transaction.
create or replace function create_warehouse_product_atomic(
  p_id uuid,
  p_warehouse_id uuid,
  p_row jsonb,
  p_quantity int default 0,
  p_quantity_by_size jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_product_id uuid;
  v_qty int;
  v_entry jsonb;
  v_size_code text;
  v_size_qty int;
begin
  v_product_id := coalesce((p_row->>'id')::uuid, p_id);
  if v_product_id is null then
    v_product_id := gen_random_uuid();
  end if;

  insert into warehouse_products (
    id, sku, barcode, name, description, category, tags,
    cost_price, selling_price, reorder_level, location, supplier, images, expiry_date,
    created_by, created_at, updated_at, version, size_kind
  ) values (
    v_product_id,
    coalesce(nullif(trim(p_row->>'sku'), ''), v_product_id::text),
    coalesce(trim(p_row->>'barcode'), ''),
    coalesce(nullif(trim(p_row->>'name'), ''), ''),
    coalesce(p_row->>'description', ''),
    coalesce(p_row->>'category', ''),
    coalesce(p_row->'tags', '[]'::jsonb),
    (coalesce((p_row->>'cost_price')::decimal, (p_row->>'costPrice')::decimal, 0)),
    (coalesce((p_row->>'selling_price')::decimal, (p_row->>'sellingPrice')::decimal, 0)),
    (coalesce((p_row->>'reorder_level')::int, (p_row->>'reorderLevel')::int, 0)),
    coalesce(p_row->'location', '{"warehouse":"","aisle":"","rack":"","bin":""}'::jsonb),
    coalesce(p_row->'supplier', '{"name":"","contact":"","email":""}'::jsonb),
    coalesce(p_row->'images', '[]'::jsonb),
    coalesce((p_row->>'expiry_date')::timestamptz, (p_row->>'expiryDate')::timestamptz),
    coalesce(p_row->>'created_by', p_row->>'createdBy', ''),
    coalesce((p_row->>'created_at')::timestamptz, (p_row->>'createdAt')::timestamptz, now()),
    now(),
    coalesce((p_row->>'version')::int, 0),
    case when jsonb_array_length(p_quantity_by_size) > 0 then 'sized'
         else coalesce(lower(nullif(trim(p_row->>'size_kind'), '')), lower(nullif(trim(p_row->>'sizeKind'), '')), 'na') end
  );

  if jsonb_array_length(p_quantity_by_size) > 0 then
    v_qty := 0;
    for v_entry in select * from jsonb_array_elements(p_quantity_by_size)
    loop
      v_size_code := upper(nullif(trim(replace(v_entry->>'sizeCode', ' ', '')), ''));
      if v_size_code is null then v_size_code := 'NA'; end if;
      v_size_qty := greatest(0, floor((v_entry->>'quantity')::numeric));
      v_qty := v_qty + v_size_qty;
      insert into warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
      values (p_warehouse_id, v_product_id, v_size_code, v_size_qty, now())
      on conflict (warehouse_id, product_id, size_code) do update set quantity = excluded.quantity, updated_at = excluded.updated_at;
    end loop;
  else
    v_qty := greatest(0, coalesce(p_quantity, 0));
  end if;

  insert into warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
  values (p_warehouse_id, v_product_id, v_qty, now())
  on conflict (warehouse_id, product_id) do update set quantity = excluded.quantity, updated_at = excluded.updated_at;

  return (select to_jsonb(wp) from warehouse_products wp where wp.id = v_product_id);
end;
$$;

comment on function create_warehouse_product_atomic is 'Atomic create: product + warehouse_inventory + warehouse_inventory_by_size in one transaction. No partial commits.';

-- Update product + inventory + optional by_size in one transaction. Version check for optimistic lock.
create or replace function update_warehouse_product_atomic(
  p_id uuid,
  p_warehouse_id uuid,
  p_row jsonb,
  p_current_version int,
  p_quantity int default null,
  p_quantity_by_size jsonb default null
)
returns jsonb
language plpgsql
as $$
declare
  v_updated int;
  v_qty int;
  v_entry jsonb;
  v_size_code text;
  v_size_qty int;
begin
  update warehouse_products set
    sku = coalesce(nullif(trim(p_row->>'sku'), ''), sku),
    barcode = coalesce(trim(p_row->>'barcode'), barcode),
    name = coalesce(nullif(trim(p_row->>'name'), ''), name),
    description = coalesce(p_row->>'description', description),
    category = coalesce(p_row->>'category', category),
    tags = coalesce(p_row->'tags', tags),
    cost_price = coalesce((p_row->>'cost_price')::decimal, (p_row->>'costPrice')::decimal, cost_price),
    selling_price = coalesce((p_row->>'selling_price')::decimal, (p_row->>'sellingPrice')::decimal, selling_price),
    reorder_level = coalesce((p_row->>'reorder_level')::int, (p_row->>'reorderLevel')::int, reorder_level),
    location = coalesce(p_row->'location', location),
    supplier = coalesce(p_row->'supplier', supplier),
    images = coalesce(p_row->'images', images),
    expiry_date = coalesce((p_row->>'expiry_date')::timestamptz, (p_row->>'expiryDate')::timestamptz, expiry_date),
    updated_at = now(),
    version = p_current_version + 1,
    size_kind = coalesce(lower(nullif(trim(p_row->>'size_kind'), '')), lower(nullif(trim(p_row->>'sizeKind'), '')), size_kind)
  where id = p_id and version = p_current_version;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Product was updated by someone else. Please refresh and try again.';
  end if;

  if p_quantity_by_size is not null and jsonb_array_length(p_quantity_by_size) > 0 then
    delete from warehouse_inventory_by_size where warehouse_id = p_warehouse_id and product_id = p_id;
    v_qty := 0;
    for v_entry in select * from jsonb_array_elements(p_quantity_by_size)
    loop
      v_size_code := upper(nullif(trim(replace(v_entry->>'sizeCode', ' ', '')), ''));
      if v_size_code is null then v_size_code := 'NA'; end if;
      v_size_qty := greatest(0, floor((v_entry->>'quantity')::numeric));
      v_qty := v_qty + v_size_qty;
      insert into warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
      values (p_warehouse_id, p_id, v_size_code, v_size_qty, now());
    end loop;
    insert into warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    values (p_warehouse_id, p_id, v_qty, now())
    on conflict (warehouse_id, product_id) do update set quantity = excluded.quantity, updated_at = excluded.updated_at;
  elsif p_quantity is not null then
    insert into warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    values (p_warehouse_id, p_id, greatest(0, p_quantity), now())
    on conflict (warehouse_id, product_id) do update set quantity = excluded.quantity, updated_at = excluded.updated_at;
  end if;

  return (select to_jsonb(wp) from warehouse_products wp where wp.id = p_id);
end;
$$;

comment on function update_warehouse_product_atomic is 'Atomic update: product (with version check) + warehouse_inventory + warehouse_inventory_by_size in one transaction.';
