/**
 * Check distinct warehouse_id in warehouse_inventory_by_size vs warehouse_inventory.
 * If they differ, that can explain list showing wrong/empty sizes.
 * Usage: node --env-file=.env.migration ./node_modules/.bin/tsx scripts/check-warehouse-ids.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.migration)');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: bySize } = await supabase
    .from('warehouse_inventory_by_size')
    .select('warehouse_id');
  const { data: inv } = await supabase
    .from('warehouse_inventory')
    .select('warehouse_id');

  const distinctBySize = [...new Set((bySize ?? []).map((r: { warehouse_id: string }) => r.warehouse_id))].slice(0, 5);
  const distinctInv = [...new Set((inv ?? []).map((r: { warehouse_id: string }) => r.warehouse_id))].slice(0, 5);

  console.log('SELECT DISTINCT warehouse_id FROM warehouse_inventory_by_size LIMIT 5;');
  console.log(distinctBySize.length ? distinctBySize : '(no rows)');
  console.log('');
  console.log('SELECT DISTINCT warehouse_id FROM warehouse_inventory LIMIT 5;');
  console.log(distinctInv.length ? distinctInv : '(no rows)');
  console.log('');
  const same = JSON.stringify([...distinctBySize].sort()) === JSON.stringify([...distinctInv].sort());
  if (!same) {
    console.log('>>> MISMATCH: different warehouse_id sets — this can cause list to show wrong/empty sizes.');
  } else {
    console.log('>>> Same warehouse_id sets (no mismatch).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
