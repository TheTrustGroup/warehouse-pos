'use server';

import { revalidatePath } from 'next/cache';
import { addInventoryItem, updateInventoryItem, AddInventoryItemData } from '@/lib/data/inventory';

export async function addItemAction(formData: FormData) {
  const warehouseId = (formData.get('warehouse_id') as string) || process.env.DEFAULT_WAREHOUSE_ID || 'default';
  const productId = formData.get('product_id') as string;
  const quantity = Number(formData.get('quantity')) || 0;
  const data: AddInventoryItemData = { warehouse_id: warehouseId, product_id: productId, quantity };
  await addInventoryItem(data);
  revalidatePath('/inventory');
}

export async function updateQtyFormAction(formData: FormData) {
  const id = formData.get('id') as string;
  const qty = Number(formData.get('qty')) || 0;
  await updateInventoryItem(id, qty);
  revalidatePath('/inventory');
}
