/**
 * Which warehouse has by_size / inventory data for how many products?
 * Usage: node --env-file=.env.migration ./node_modules/.bin/tsx scripts/diagnostic-warehouse-product-counts.ts
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
  console.log('-- Which warehouse has the by_size data for most products?');
  console.log('SELECT warehouse_id, count(DISTINCT product_id) as products FROM warehouse_inventory_by_size GROUP BY warehouse_id;\n');

  const { data: bySize } = await supabase.from('warehouse_inventory_by_size').select('warehouse_id, product_id');
  const bySizeMap = new Map<string, Set<string>>();
  for (const r of (bySize ?? []) as { warehouse_id: string; product_id: string }[]) {
    if (!bySizeMap.has(r.warehouse_id)) bySizeMap.set(r.warehouse_id, new Set());
    bySizeMap.get(r.warehouse_id)!.add(r.product_id);
  }
  for (const [wid, set] of [...bySizeMap.entries()].sort()) {
    console.log('  warehouse_id:', wid, '| products:', set.size);
  }
  if (bySizeMap.size === 0) console.log('  (no rows)');

  console.log('\n-- Same for inventory');
  console.log('SELECT warehouse_id, count(DISTINCT product_id) as products FROM warehouse_inventory GROUP BY warehouse_id;\n');

  const { data: inv } = await supabase.from('warehouse_inventory').select('warehouse_id, product_id');
  const invMap = new Map<string, Set<string>>();
  for (const r of (inv ?? []) as { warehouse_id: string; product_id: string }[]) {
    if (!invMap.has(r.warehouse_id)) invMap.set(r.warehouse_id, new Set());
    invMap.get(r.warehouse_id)!.add(r.product_id);
  }
  for (const [wid, set] of [...invMap.entries()].sort()) {
    console.log('  warehouse_id:', wid, '| products:', set.size);
  }
  if (invMap.size === 0) console.log('  (no rows)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
