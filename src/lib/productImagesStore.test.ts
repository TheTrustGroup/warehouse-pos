import { describe, it, expect, beforeEach } from 'vitest';
import { resolveProductImages, setProductImages, getProductImages } from './productImagesStore';

const STORAGE_KEY = 'product_images_v1';

describe('resolveProductImages', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('prefers API images when present', () => {
    setProductImages('p1', ['https://evil.local/stale.jpg']);
    const api = ['https://puuszplmdbindiesfxlr.supabase.co/storage/v1/object/public/product-images/a.jpg'];
    expect(resolveProductImages('p1', api)).toEqual(api);
  });

  it('falls back to localStorage when API is empty', () => {
    const cached = ['https://puuszplmdbindiesfxlr.supabase.co/storage/v1/object/public/product-images/b.jpg'];
    setProductImages('p2', cached);
    expect(resolveProductImages('p2', [])).toEqual(cached);
  });

  it('does not cache base64 in setProductImages', () => {
    setProductImages('p3', ['data:image/png;base64,abc']);
    expect(getProductImages('p3')).toBeUndefined();
  });
});
