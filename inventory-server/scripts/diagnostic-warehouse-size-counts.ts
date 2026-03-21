/**
 * Warehouse + by_size counts (products_with_sizes, total_size_rows).
 * Usage: node --env-file=.env.migration ./node_modules/.bin/tsx scripts/diagnostic-warehouse-size-counts.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: warehouses } = await supabase.from('warehouses').select('id, name').order('created_at', { ascending: true });
  const { data: bySize } = await supabase.from('warehouse_inventory_by_size').select('warehouse_id, product_id');

  const rows = (warehouses ?? []) as { id: string; name: string }[];
  const sizeRows = (bySize ?? []) as { warehouse_id: string; product_id: string }[];

  console.log('warehouse           | products_with_sizes | total_size_rows');
  console.log('--------------------+---------------------+------------------');

  for (const w of rows) {
    const forWarehouse = sizeRows.filter((r) => r.warehouse_id === w.id);
    const productIds = new Set(forWarehouse.map((r) => r.product_id));
    console.log(
      `${(w.name ?? '').padEnd(18)} | ${String(productIds.size).padStart(19)} | ${String(forWarehouse.length).padStart(16)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
