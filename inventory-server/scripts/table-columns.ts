/**
 * Get column names for warehouse_inventory_by_size.
 * SELECT column_name FROM information_schema.columns WHERE table_name = 'warehouse_inventory_by_size' ORDER BY ordinal_position;
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
  const { data: sample } = await supabase
    .from('warehouse_inventory_by_size')
    .select('*')
    .limit(1);

  const row = Array.isArray(sample) ? sample[0] : sample;
  if (row && typeof row === 'object') {
    const cols = Object.keys(row as object).sort();
    console.log('Columns (from first row keys):', cols.join(', '));
    console.log('');
    console.log('Code selects: product_id, size_code, quantity');
    for (const c of ['product_id', 'size_code', 'quantity']) {
      const has = (row as Record<string, unknown>)[c] !== undefined;
      console.log(' ', c, ':', has ? 'present' : 'MISSING');
    }
  } else {
    console.log('No rows in warehouse_inventory_by_size or unexpected shape.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
