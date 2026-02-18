-- Last-resort: single DB function that returns products with sizes for a warehouse.
-- Guarantees the Size column data: one source of truth, no API merge bugs, no missing FK/embed issues.
-- Custom size codes supported (left join size_codes; fallback to size_code as label).

create or replace function get_products_with_sizes(
  p_warehouse_id uuid,
  p_limit int default 500,
  p_offset int default 0,
  p_search text default null,
  p_category text default null
)
returns table (data jsonb, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_products jsonb;
  v_search_escaped text;
begin
  -- Escape search for safe use in LIKE (basic: single quote doubled)
  v_search_escaped := replace(coalesce(trim(p_search), ''), '''', '''''');
  if v_search_escaped = '' then
    v_search_escaped := null;
  end if;

  -- Total count of products matching filters (products are global)
  select count(*) into v_total
  from warehouse_products wp
  where (v_search_escaped is null or wp.name ilike '%' || v_search_escaped || '%' or wp.sku ilike '%' || v_search_escaped || '%' or wp.barcode ilike '%' || v_search_escaped || '%')
    and (p_category is null or trim(p_category) = '' or wp.category = trim(p_category));

  -- Build one row per product with quantity and sizes from this warehouse (lateral = single source of truth)
  with page as (
    select wp.id
    from warehouse_products wp
    where (v_search_escaped is null or wp.name ilike '%' || v_search_escaped || '%' or wp.sku ilike '%' || v_search_escaped || '%' or wp.barcode ilike '%' || v_search_escaped || '%')
      and (p_category is null or trim(p_category) = '' or wp.category = trim(p_category))
    order by wp.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
    offset greatest(0, coalesce(p_offset, 0))
  ),
  with_inv as (
    select
      wp.id,
      wp.sku,
      wp.barcode,
      wp.name,
      wp.description,
      wp.category,
      wp.tags,
      wp.cost_price,
      wp.selling_price,
      wp.reorder_level,
      wp.location,
      wp.supplier,
      wp.images,
      wp.expiry_date,
      wp.created_by,
      wp.created_at,
      wp.updated_at,
      wp.version,
      coalesce(wp.size_kind, 'na') as size_kind,
      coalesce(wi.quantity, 0) as quantity,
      sizes_json.quantity_by_size,
      sizes_json.sizes_arr
    from page p
    join warehouse_products wp on wp.id = p.id
    left join warehouse_inventory wi on wi.warehouse_id = p_warehouse_id and wi.product_id = wp.id
    left join lateral (
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'sizeCode', wibs.size_code,
              'sizeLabel', coalesce(sc.size_label, wibs.size_code),
              'quantity', wibs.quantity
            ) order by coalesce(sc.size_order, 0), wibs.size_code
          ) filter (where wibs.size_code is not null),
          '[]'::jsonb
        ) as quantity_by_size,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'size', coalesce(sc.size_label, wibs.size_code),
              'quantity', wibs.quantity
            ) order by coalesce(sc.size_order, 0), wibs.size_code
          ) filter (where wibs.size_code is not null),
          '[]'::jsonb
        ) as sizes_arr
      from warehouse_inventory_by_size wibs
      left join size_codes sc on sc.size_code = wibs.size_code
      where wibs.warehouse_id = p_warehouse_id and wibs.product_id = wp.id
    ) sizes_json on true
  )
  -- When product has quantity but no rows in warehouse_inventory_by_size (e.g. table added later), show "One size: N" so Size column is never empty.
  select jsonb_agg(
    jsonb_build_object(
      'id', id,
      'sku', sku,
      'barcode', barcode,
      'name', name,
      'description', description,
      'category', category,
      'tags', tags,
      'quantity', quantity,
      'costPrice', cost_price,
      'sellingPrice', selling_price,
      'reorderLevel', reorder_level,
      'location', location,
      'supplier', supplier,
      'images', images,
      'expiryDate', expiry_date,
      'createdBy', created_by,
      'createdAt', created_at,
      'updatedAt', updated_at,
      'version', version,
      'sizeKind', size_kind,
      'quantityBySize', case
        when coalesce(quantity_by_size, '[]'::jsonb) = '[]'::jsonb and quantity > 0 then
          jsonb_build_array(jsonb_build_object('sizeCode', 'One size', 'sizeLabel', 'One size', 'quantity', quantity))
        else coalesce(quantity_by_size, '[]'::jsonb)
      end,
      'sizes', case
        when coalesce(sizes_arr, '[]'::jsonb) = '[]'::jsonb and quantity > 0 then
          jsonb_build_array(jsonb_build_object('size', 'One size', 'quantity', quantity))
        else coalesce(sizes_arr, '[]'::jsonb)
      end
    )
  ) into v_products
  from with_inv;

  data := coalesce(v_products, '[]'::jsonb);
  total := v_total;
  return next;
end;
$$;

comment on function get_products_with_sizes is 'Returns products with total quantity and per-size breakdown for one warehouse. Single source of truth for list/sizes; custom size codes supported via left join size_codes.';
