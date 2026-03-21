/**
 * SELECT warehouse_id, size_code, quantity FROM warehouse_inventory_by_size
 * WHERE product_id = (SELECT id FROM warehouse_products WHERE sku = 'SKU-MLSIA92M-O0087');
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const SKU = 'SKU-MLSIA92M-O0087';

async function main() {
  const { data: prod } = await supabase
    .from('warehouse_products')
    .select('id')
    .eq('sku', SKU)
    .maybeSingle();

  const productId = (prod as { id?: string } | null)?.id;
  if (!productId) {
    console.log('No product found with sku =', SKU);
    return;
  }

  const { data: rows } = await supabase
    .from('warehouse_inventory_by_size')
    .select('warehouse_id, size_code, quantity')
    .eq('product_id', productId);

  console.log('product_id:', productId, '(sku:', SKU + ')');
  console.log('warehouse_id                          | size_code | quantity');
  console.log('--------------------------------------+-----------+----------');
  for (const r of (rows ?? []) as { warehouse_id: string; size_code: string; quantity: number }[]) {
    console.log(`${r.warehouse_id} | ${(r.size_code ?? '').padEnd(9)} | ${r.quantity}`);
  }
  if (!rows?.length) console.log('(no rows)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
