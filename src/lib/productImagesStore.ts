/**
 * Client-side store for product images. Written on every add/update that has images;
 * read when displaying the list. Ensures images "stick" even when the API omits them
 * or a refresh overwrites the in-memory list.
 */

import { getStoredData, setStoredData, isStorageAvailable } from './storage';

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

/** Get images for a product (from local saves). Prefer this when API/product.images is empty. */
export function getProductImages(productId: string): string[] | undefined {
  const store = read();
  const images = store[productId];
  return Array.isArray(images) && images.length > 0 ? images : undefined;
}

/** Save images for a product. Call after every add/update that includes images. */
export function setProductImages(productId: string, images: string[]): void {
  const store = read();
  const next = Array.isArray(images) && images.length > 0 ? images : [];
  if (next.length === 0) {
    delete store[productId];
  } else {
    store[productId] = next;
  }
  write(store);
}
