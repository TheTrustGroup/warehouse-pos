/**
 * ONE TEST — no assumptions. Run this, then do the app steps, and compare three outputs.
 *
 * 1. DB state (this script)
 * 2. Card display (screenshot what the product card shows in the app)
 * 3. API response (DevTools → Network → products request → Preview → find this product → sizeKind + quantityBySize)
 *
 * Usage (from inventory-server):
 *   npx tsx scripts/diagnostic-one-product-three-way.ts <SKU>
 *
 * Example:
 *   npx tsx scripts/diagnostic-one-product-three-way.ts ABC-123
 *
 * Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. .env.migration or .env.local).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim() || '';
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.migration or .env.local)');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const sku = process.argv[2]?.trim();
const listOnly = sku === '--list' || sku === '-l';
if (!sku) {
  console.error('Usage: npx tsx scripts/diagnostic-one-product-three-way.ts <SKU>');
  console.error('        npx tsx scripts/diagnostic-one-product-three-way.ts --list   # list multi-size products (pick one SKU)');
  process.exit(1);
}

async function listMultiSizeProducts(): Promise<void> {
  const { data: bySize } = await supabase
    .from('warehouse_inventory_by_size')
    .select('product_id, size_code')
    .limit(2000);
  const byProduct = new Map<string, Set<string>>();
  for (const r of (bySize ?? []) as { product_id: string; size_code: string }[]) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, new Set());
    byProduct.get(r.product_id)!.add(r.size_code);
  }
  const multiSizeIds = [...byProduct.entries()].filter(([, codes]) => codes.size >= 2).map(([id]) => id);
  if (multiSizeIds.length === 0) {
    console.log('No products found with multiple size_code rows.');
    return;
  }
  const { data: prods } = await supabase.from('warehouse_products').select('id, sku, name, size_kind').in('id', multiSizeIds);
  const list = (prods ?? []) as { id: string; sku: string; name: string; size_kind: string }[];
  console.log('Products with multiple sizes (pick one SKU for the test):');
  for (const p of list.slice(0, 20)) {
    const codes = byProduct.get(p.id);
    console.log('  SKU=%s  size_kind=%s  sizes=[%s]', p.sku, p.size_kind, codes ? [...codes].sort().join(', ') : '');
  }
  if (list.length > 20) console.log('  ... and', list.length - 20, 'more');
}

async function run() {
  if (listOnly) {
    await listMultiSizeProducts();
    return;
  }
  // Same as your SQL: product row + by_size rows for this SKU
  const { data: products, error: e0 } = await supabase
    .from('warehouse_products')
    .select('id, sku, size_kind')
    .eq('sku', sku)
    .limit(1);

  if (e0) {
    console.error('DB error:', e0.message);
    process.exit(1);
  }
  const wp = products?.[0] as { id: string; sku: string; size_kind: string } | undefined;
  if (!wp) {
    console.error('No product found with SKU:', sku);
    process.exit(1);
  }

  const { data: bySize, error: e1 } = await supabase
    .from('warehouse_inventory_by_size')
    .select('size_code, quantity, warehouse_id')
    .eq('product_id', wp.id)
    .order('size_code');

  if (e1) {
    console.error('DB error (by_size):', e1.message);
    process.exit(1);
  }
  const rows = (bySize ?? []) as { size_code: string; quantity: number; warehouse_id: string }[];

  console.log('========================================');
  console.log('1. DB STATE (what you asked for)');
  console.log('========================================');
  console.log('Equivalent of:');
  console.log("  SELECT wp.sku, wp.size_kind, bs.size_code, bs.quantity, bs.warehouse_id");
  console.log("  FROM warehouse_products wp");
  console.log("  LEFT JOIN warehouse_inventory_by_size bs ON bs.product_id = wp.id");
  console.log("  WHERE wp.sku = '" + sku + "';");
  console.log('');
  console.log('Product: id=%s sku=%s size_kind=%s', wp.id, wp.sku, wp.size_kind);
  if (rows.length === 0) {
    console.log('By-size rows: (none)');
  } else {
    console.log('By-size rows:');
    for (const r of rows) {
      console.log('  size_code=%s quantity=%s warehouse_id=%s', r.size_code, r.quantity, r.warehouse_id);
    }
  }
  console.log('');
  console.log('========================================');
  console.log('2. CARD DISPLAY');
  console.log('========================================');
  console.log('Open the app → go to this product (Inventory or POS).');
  console.log('Screenshot what the card shows (size pills / "One size" / "No sizes recorded").');
  console.log('');
  console.log('========================================');
  console.log('3. API RESPONSE');
  console.log('========================================');
  console.log('DevTools → Network → hard refresh → find the products GET request.');
  console.log('Click it → Preview tab → find the object for SKU "%s".', sku);
  console.log('Screenshot or copy: sizeKind and quantityBySize for that object.');
  console.log('');
  console.log('Share: (1) this script output, (2) card screenshot, (3) API sizeKind + quantityBySize.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
