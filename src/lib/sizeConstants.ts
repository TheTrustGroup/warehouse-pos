/**
 * Single source of truth for product size type.
 * Keeps UI, validation, sync, and API consistent.
 * DB: warehouse_products.size_kind + warehouse_inventory_by_size (no single "sizes" column).
 */

export const SIZE_KINDS = ['na', 'one_size', 'sized'] as const;
export type SizeKind = (typeof SIZE_KINDS)[number];

export const SIZE_KIND_LABELS: Record<SizeKind, string> = {
  na: 'No sizes',
  one_size: 'One size',
  sized: 'Multiple sizes',
};

/** Valid for DB and API (lowercase). */
export function isValidSizeKind(value: unknown): value is SizeKind {
  return typeof value === 'string' && SIZE_KINDS.includes(value as SizeKind);
}

/** Normalize to valid size kind; default 'na'. */
export function normalizeSizeKind(value: unknown): SizeKind {
  const s = String(value ?? 'na').toLowerCase();
  return isValidSizeKind(s) ? s : 'na';
}

/** Product-like shape (API may return sizeKind or size_kind). */
interface ProductLike {
  sizeKind?: string;
  size_kind?: string;
  quantityBySize?: Array<{ sizeCode?: string; quantity?: number }>;
}

/** True when product has multiple sizes with per-size quantities (show pills in list/POS). */
export function hasSizedQuantityBySize(product: ProductLike): boolean {
  const kind = (product.sizeKind ?? product.size_kind ?? 'na') as string;
  const list = Array.isArray(product.quantityBySize) ? product.quantityBySize : [];
  return kind === 'sized' && list.length > 0;
}

/** True when product is "One size" (single size, no per-size breakdown). */
export function isOneSize(product: ProductLike): boolean {
  return (product.sizeKind ?? product.size_kind ?? 'na') === 'one_size';
}
