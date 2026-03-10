/**
 * Product image URL helper — CDN-ready.
 * For list/grid use 'thumb'; for detail/lightbox use 'full'.
 * - Data URLs (base64): returned as-is.
 * - Supabase Storage public URLs: rewritten to the Image Transform API (thumb/medium/full).
 *   Requires Supabase Pro for transforms. See docs/CDN_AND_IMAGE_OPTIMIZATION.md.
 * - Other HTTP(S) URLs: returned as-is (or add your CDN logic below).
 */

export type ProductImageSize = 'thumb' | 'medium' | 'full';

const SIZE_PARAMS: Record<ProductImageSize, { width: number; height: number }> = {
  thumb: { width: 150, height: 150 },
  medium: { width: 400, height: 400 },
  full: { width: 1200, height: 1200 },
};

/**
 * If url is a Supabase Storage public object URL, return the render/image URL with size params.
 * Pattern: .../storage/v1/object/public/<bucket>/<path> -> .../storage/v1/render/image/public/<bucket>/<path>?width=...&height=...
 */
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
 * Return the URL to use for a product image at the given display size.
 * Data URLs are unchanged. Supabase Storage public URLs use the Image Transform API when available.
 */
export function getProductImageUrl(
  url: string | undefined | null,
  size: ProductImageSize = 'thumb'
): string {
  if (url == null || url === '') return '';
  if (url.startsWith('data:')) return url;
  const renderUrl = toSupabaseRenderUrl(url, size);
  if (renderUrl) return renderUrl;
  return url;
}
