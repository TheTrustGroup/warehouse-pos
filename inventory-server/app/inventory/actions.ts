'use server';

import { revalidatePath } from 'next/cache';
import {
  addProduct,
  addProductVariant,
  updateVariantStock,
} from '@/lib/data/inventory';

export async function addProductAction(formData: FormData) {
  const name = (formData.get('name') as string)?.trim();
  const slug = (formData.get('slug') as string)?.trim() || name?.toLowerCase().replace(/\s+/g, '-');
  const description = (formData.get('description') as string)?.trim() || null;
  const price = Number(formData.get('price')) || 0;
  const categoryId = (formData.get('categoryId') as string) || 'cat_default';
  if (!name) throw new Error('Name required');
  await addProduct({ name, slug, description, price, categoryId });
  revalidatePath('/inventory');
}

export async function addVariantAction(formData: FormData) {
  const productId = formData.get('productId') as string;
  const size = (formData.get('size') as string)?.trim() || null;
  const sku = (formData.get('sku') as string)?.trim() || null;
  const price = Number(formData.get('price')) || 0;
  const stock = Number(formData.get('stock')) || 0;
  if (!productId) throw new Error('Product required');
  await addProductVariant({ productId, size, sku, price, stock });
  revalidatePath('/inventory');
}

export async function updateVariantStockAction(formData: FormData) {
  const id = formData.get('id') as string;
  const stock = Number(formData.get('stock')) || 0;
  await updateVariantStock(id, stock);
  revalidatePath('/inventory');
}
