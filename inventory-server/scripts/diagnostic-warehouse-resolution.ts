/**
 * Diagnostic: which warehouse(s) have by_size rows for the test product, and what warehouses exist.
 * Usage: node --env-file=.env.migration ./node_modules/.bin/tsx scripts/diagnostic-warehouse-resolution.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const PRODUCT_ID = 'aea9f066-e1d0-40e7-896e-40240c9083d0';

async function main() {
  console.log('-- For test product', PRODUCT_ID);
  console.log('SELECT warehouse_id, count(*) as rows FROM warehouse_inventory_by_size WHERE product_id = ... GROUP BY warehouse_id;\n');

  const { data: bySize } = await supabase
    .from('warehouse_inventory_by_size')
    .select('warehouse_id')
    .eq('product_id', PRODUCT_ID);

  const rows = (bySize ?? []) as { warehouse_id: string }[];
  const byWarehouse = new Map<string, number>();
  for (const r of rows) {
    const w = r.warehouse_id;
    byWarehouse.set(w, (byWarehouse.get(w) ?? 0) + 1);
  }
  for (const [warehouse_id, count] of [...byWarehouse.entries()].sort()) {
    console.log('  warehouse_id:', warehouse_id, '| rows:', count);
  }
  if (byWarehouse.size === 0) console.log('  (no rows)');

  console.log('\n-- What warehouse IDs exist?');
  console.log('SELECT id, name FROM warehouses ORDER BY created_at;\n');

  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });

  for (const w of (warehouses ?? []) as { id: string; name: string; created_at?: string }[]) {
    console.log('  id:', w.id, '| name:', w.name ?? '');
  }
  if (!warehouses?.length) console.log('  (no rows or table missing)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
