/**
 * One-off diagnostic: same as the critical SQL for a product (by_size, inventory_total, product_row).
 * Usage: node --env-file=.env.migration ./node_modules/.bin/tsx scripts/diagnostic-product-sizes.ts [product_id]
 * If product_id is omitted, uses a product that has multiple sizes (if any).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.migration)');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function findProductWithMultipleSizes(): Promise<string | null> {
  const { data } = await supabase
    .from('warehouse_inventory_by_size')
    .select('product_id')
    .limit(500);
  if (!data?.length) return null;
  const byProduct = new Map<string, number>();
  for (const r of data as { product_id: string }[]) {
    const id = r.product_id;
    byProduct.set(id, (byProduct.get(id) ?? 0) + 1);
  }
  const withMultiple = [...byProduct.entries()].filter(([, count]) => count >= 2);
  return withMultiple[0]?.[0] ?? data?.[0] ? (data[0] as { product_id: string }).product_id : null;
}

async function run(productId: string) {
  const rows: { source: string; size_code: string | null; quantity: string | null; warehouse_id: string | null }[] = [];

  const { data: bySize } = await supabase
    .from('warehouse_inventory_by_size')
    .select('size_code, quantity, warehouse_id')
    .eq('product_id', productId);
  for (const r of (bySize ?? []) as { size_code: string; quantity: number; warehouse_id: string }[]) {
    rows.push({ source: 'by_size', size_code: r.size_code, quantity: String(r.quantity), warehouse_id: r.warehouse_id });
  }

  const { data: inv } = await supabase
    .from('warehouse_inventory')
    .select('quantity, warehouse_id')
    .eq('product_id', productId);
  for (const r of (inv ?? []) as { quantity: number; warehouse_id: string }[]) {
    rows.push({ source: 'inventory_total', size_code: null, quantity: String(r.quantity), warehouse_id: r.warehouse_id });
  }

  const { data: prod } = await supabase
    .from('warehouse_products')
    .select('size_kind')
    .eq('id', productId)
    .maybeSingle();
  if (prod) {
    const p = prod as { size_kind: string | null };
    rows.push({ source: 'product_row', size_code: p.size_kind ?? null, quantity: null, warehouse_id: null });
  }

  console.log('Product ID:', productId);
  console.log('source           | size_code   | quantity | warehouse_id');
  console.log('-----------------+-------------+----------+--------------------------------------');
  for (const r of rows) {
    const a = (r.source ?? '').padEnd(16);
    const b = (r.size_code ?? '').padEnd(11);
    const c = (r.quantity ?? '').padEnd(8);
    const d = r.warehouse_id ?? '';
    console.log(`${a} | ${b} | ${c} | ${d}`);
  }
  if (rows.length === 0) console.log('(no rows found for this product_id)');
}

async function main() {
  let productId = process.argv[2]?.trim();
  if (!productId || productId === 'YOUR-PRODUCT-ID') {
    console.log('No product ID provided; looking for a product with multiple sizes...');
    productId = (await findProductWithMultipleSizes()) ?? '';
    if (!productId) {
      console.error('No product_id found in warehouse_inventory_by_size. Pass one: tsx scripts/diagnostic-product-sizes.ts <product_id>');
      process.exit(1);
    }
    console.log('Using product_id:', productId, '\n');
  }
  await run(productId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
