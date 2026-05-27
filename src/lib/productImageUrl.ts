/**
 * Single source of truth for product image URLs (display + validation).
 * Upload/delete live in imageUpload.ts; persistence policy on the server in lib/storage/productImages.ts.
 *
 * Storage-first: DB holds public Supabase URLs only (see persistableProductImages on API).
 * List/grid uses object/public URLs; optional transforms when VITE_SUPABASE_IMAGE_TRANSFORMS=true (Pro).
 */

export const PRODUCT_IMAGES_BUCKET = 'product-images';

export type ProductImageSize = 'thumb' | 'medium' | 'full';

/** 1x1 transparent GIF when src is missing or not allowed (XSS). */
export const EMPTY_IMAGE_DATA_URL =
  'data:image/gif;base64,R0lGOODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const SIZE_PARAMS: Record<ProductImageSize, { width: number; height: number }> = {
  thumb: { width: 150, height: 150 },
  medium: { width: 400, height: 400 },
  full: { width: 1200, height: 1200 },
};

function getSupabaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env != null) {
    return String((import.meta.env as { VITE_SUPABASE_URL?: string }).VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  }
  return '';
}

function supabaseImageTransformsEnabled(): boolean {
  if (typeof import.meta === 'undefined' || import.meta.env == null) return false;
  return String(import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORMS ?? '').toLowerCase() === 'true';
}

export function isBase64(src: string): boolean {
  return src.startsWith('data:');
}

export function isStorageUrl(src: string): boolean {
  return src.startsWith('http') && src.includes('/storage/v1/object/');
}

/** True for https/http URLs we persist in warehouse_products.images (not base64). */
export function isPersistableImageUrl(src: string): boolean {
  const s = src.trim();
  return s.startsWith('http://') || s.startsWith('https://');
}

/** Public object URL in our product-images bucket (any Supabase project ref). */
export function isProductImagesBucketUrl(src: string): boolean {
  const s = src.trim();
  return (
    isPersistableImageUrl(s) &&
    s.includes('/storage/v1/object/') &&
    s.includes(`/${PRODUCT_IMAGES_BUCKET}/`)
  );
}

/**
 * Safe img src: data URLs, or Storage URLs for product-images (env URL or any *.supabase.co bucket path).
 */
export function safeProductImageUrl(src: string): string {
  if (typeof src !== 'string' || !src.trim()) return EMPTY_IMAGE_DATA_URL;
  const s = src.trim();
  if (isBase64(s)) return s;
  const base = getSupabaseUrl();
  if (base && s.startsWith(base) && isProductImagesBucketUrl(s)) return s;
  if (isProductImagesBucketUrl(s)) return s;
  return EMPTY_IMAGE_DATA_URL;
}

function toSupabaseRenderUrl(url: string, size: ProductImageSize): string | null {
  const objectPrefix = '/storage/v1/object/public/';
  const i = url.indexOf(objectPrefix);
  if (i === -1) return null;
  const base = url.slice(0, i);
  const path = url.slice(i + objectPrefix.length);
  const { width, height } = SIZE_PARAMS[size];
  const renderPath = `${base}/storage/v1/render/image/public/${path}`;
  const sep = renderPath.includes('?') ? '&' : '?';
  return `${renderPath}${sep}width=${width}&height=${height}&resize=cover`;
}

/**
 * Display URL for inventory/POS. Applies optional Supabase transforms, then safeProductImageUrl.
 */
export function getProductImageUrl(
  url: string | undefined | null,
  size: ProductImageSize = 'thumb'
): string {
  if (url == null || url === '') return '';
  const s = url.trim();
  if (isBase64(s)) return s;
  let candidate = s;
  if (supabaseImageTransformsEnabled()) {
    const renderUrl = toSupabaseRenderUrl(s, size);
    if (renderUrl) candidate = renderUrl;
  }
  const safe = safeProductImageUrl(candidate);
  return safe === EMPTY_IMAGE_DATA_URL && isProductImagesBucketUrl(s) ? s : safe;
}
