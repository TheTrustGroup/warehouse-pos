import { getInventory } from '@/lib/data/inventory';
import { addItemAction, updateQtyFormAction } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InventoryPage() {
  const warehouseId = process.env.DEFAULT_WAREHOUSE_ID ?? 'default';
  const inventory = await getInventory(warehouseId);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Inventory — Server only</h1>
      <p>Direct DB read. No client state. Full page refresh on write.</p>

      <section style={{ marginTop: 24 }}>
        <h2>Add item</h2>
        <form action={addItemAction}>
          <input type="hidden" name="warehouse_id" value={warehouseId} />
          <input name="product_id" placeholder="product_id" required style={{ marginRight: 8, padding: 6 }} />
          <input type="number" name="quantity" placeholder="qty" defaultValue={1} style={{ marginRight: 8, padding: 6, width: 72 }} />
          <button type="submit" style={{ padding: 6 }}>Add</button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Items ({inventory.length})</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {inventory.map((item) => (
            <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ flex: 1 }}>{item.product_id}</span>
              <span style={{ width: 48 }}>qty: {item.quantity}</span>
              <form action={updateQtyFormAction} style={{ display: 'inline-flex', gap: 4 }}>
                <input type="hidden" name="id" value={item.id} />
                <input type="number" name="qty" defaultValue={item.quantity} style={{ width: 56, padding: 4 }} />
                <button type="submit" style={{ padding: 4 }}>Update</button>
              </form>
            </li>
          ))}
        </ul>
        {inventory.length === 0 && <p>No items. Add one above.</p>}
      </section>
    </main>
  );
}
