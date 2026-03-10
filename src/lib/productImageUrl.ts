/**
 * Product image URL helper — CDN-ready.
 * For list/grid use 'thumb'; for detail/lightbox use 'full'.
 * Today: returns url as-is. When using Supabase Storage or a CDN with transforms,
 * append size params here (e.g. ?width=150 for thumb, ?width=800 for full).
 */

export type ProductImageSize = 'thumb' | 'medium' | 'full';

/**
 * Return the URL to use for a product image at the given display size.
 * Data URLs (base64) are returned unchanged. HTTP(S) URLs can later be
 * rewritten with CDN/transform params for thumb/medium/full.
 */
export function getProductImageUrl(
  url: string | undefined | null,
  _size: ProductImageSize = 'thumb'
): string {
  if (url == null || url === '') return '';
  // Data URLs: use as-is (no CDN transform)
  if (url.startsWith('data:')) return url;
  // TODO: when using Supabase Storage or CDN, use _size to append params, e.g.:
  // if (_size === 'thumb') return `${url}?width=150&height=150&resize=cover`;
  // if (_size === 'medium') return `${url}?width=400`;
  return url;
}
