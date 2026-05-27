/**
 * Optional browser cache for product image URLs when the API list omits images (legacy / transient).
 * Source of truth: warehouse_products.images in Supabase (Storage URLs). Not a substitute for the bucket.
 */

import { getStoredData, setStoredData, isStorageAvailable } from './storage';
import { isPersistableImageUrl } from './productImageUrl';

const KEY = 'product_images_v1';

type Store = Record<string, string[]>;

function read(): Store {
  if (!isStorageAvailable()) return {};
  return getStoredData<Store>(KEY, {});
}

function write(store: Store): boolean {
  if (!isStorageAvailable()) return false;
  return setStoredData(KEY, store);
}

/** Get cached images for a product (browser only). */
export function getProductImages(productId: string): string[] | undefined {
  const store = read();
  const images = store[productId];
  return Array.isArray(images) && images.length > 0 ? images : undefined;
}

/**
 * Resolve images for UI: API/DB first; localStorage only when API returns none.
 * Prevents stale localStorage from overriding Storage URLs from the server.
 */
export function resolveProductImages(
  productId: string,
  apiImages: string[] | undefined
): string[] {
  const fromApi = Array.isArray(apiImages)
    ? apiImages.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  if (fromApi.length > 0) return fromApi;
  return getProductImages(productId) ?? [];
}

/** Cache URLs after save (Storage URLs only — avoids caching base64 in localStorage). */
export function setProductImages(productId: string, images: string[]): void {
  const next = (Array.isArray(images) ? images : [])
    .filter((s): s is string => typeof s === 'string' && isPersistableImageUrl(s))
    .slice(0, 5);
  const store = read();
  if (next.length === 0) {
    delete store[productId];
  } else {
    store[productId] = next;
  }
  write(store);
}
