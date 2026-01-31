import {
  getProducts,
  getProductVariants,
  getCategories,
} from '@/lib/data/inventory';
import {
  addProductAction,
  addVariantAction,
  updateVariantStockAction,
} from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InventoryPage() {
  const [products, variants, categories] = await Promise.all([
    getProducts(),
    getProductVariants(),
    getCategories(),
  ]);
  const variantsByProduct = variants.reduce<Record<string, typeof variants>>(
    (acc, v) => {
      const pid = v.productId as string;
      if (!acc[pid]) acc[pid] = [];
      acc[pid].push(v);
      return acc;
    },
    {}
  );

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Inventory — Server only (Supabase Product + ProductVariant)</h1>
      <p style={{ color: '#666' }}>
        Direct DB read. No client state. Full page refresh on write. Data never lost.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2>Add product</h2>
        <form action={addProductAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input name="name" placeholder="Name" required style={{ padding: 6 }} />
          <input name="slug" placeholder="slug (optional)" style={{ padding: 6, width: 140 }} />
          <input name="description" placeholder="Description" style={{ padding: 6, width: 180 }} />
          <input type="number" name="price" placeholder="Price" defaultValue={0} style={{ padding: 6, width: 80 }} />
          <select name="categoryId" style={{ padding: 6 }}>
            {categories.length === 0 ? (
              <option value="cat_default">Default</option>
            ) : (
              categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))
            )}
          </select>
          <button type="submit" style={{ padding: 6 }}>Add product</button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Add variant (SKU, stock)</h2>
        <form action={addVariantAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select name="productId" required style={{ padding: 6, minWidth: 200 }}>
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input name="size" placeholder="Size (e.g. M)" style={{ padding: 6, width: 72 }} />
          <input name="sku" placeholder="SKU" style={{ padding: 6, width: 120 }} />
          <input type="number" name="price" placeholder="Price" defaultValue={0} style={{ padding: 6, width: 72 }} />
          <input type="number" name="stock" placeholder="Stock" defaultValue={0} style={{ padding: 6, width: 72 }} />
          <button type="submit" style={{ padding: 6 }}>Add variant</button>
        </form>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Products ({products.length})</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {products.map((product) => (
            <li key={product.id} style={{ marginBottom: 20, padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
              <div style={{ fontWeight: 600 }}>{product.name}</div>
              <div style={{ fontSize: 14, color: '#666' }}>{product.slug} · {product.price} · {product.categoryId}</div>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
                {(variantsByProduct[product.id] ?? []).map((v) => (
                  <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                    <span>SKU: {v.sku ?? '—'}</span>
                    <span>Size: {v.size ?? '—'}</span>
                    <span>Stock: {v.stock}</span>
                    <form action={updateVariantStockAction} style={{ display: 'inline-flex', gap: 4 }}>
                      <input type="hidden" name="id" value={v.id} />
                      <input type="number" name="stock" defaultValue={v.stock} style={{ width: 56, padding: 4 }} />
                      <button type="submit" style={{ padding: 4 }}>Update</button>
                    </form>
                  </li>
                ))}
              </ul>
              {(!variantsByProduct[product.id] || variantsByProduct[product.id].length === 0) && (
                <div style={{ fontSize: 14, color: '#999' }}>No variants yet.</div>
              )}
            </li>
          ))}
        </ul>
        {products.length === 0 && (
          <p>No products. Create a Category (e.g. cat_default) and add a product above.</p>
        )}
      </section>
    </main>
  );
}
