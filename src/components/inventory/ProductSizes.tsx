/**
 * Shared sizes display for inventory table and grid.
 * Used in BOTH desktop row and mobile card — no viewport-based hiding.
 * Handles empty states safely; fixed min-height to prevent layout shift.
 */

import type { QuantityBySizeItem } from '../../types';

export interface ProductSizesProps {
  /** Product-like shape: sizeKind + quantityBySize (or full Product). */
  sizeKind?: string;
  quantityBySize?: QuantityBySizeItem[] | Array<{ sizeCode?: string; quantity?: number; sizeLabel?: string }>;
  /** Optional label above badges (e.g. "Size" in grid). Omit for table cell. */
  label?: string;
  /** Compact (table) vs default (grid). Both use same badge style. */
  variant?: 'compact' | 'default';
  className?: string;
}

const SIZES_MIN_HEIGHT = 40;

/** Normalize to array; never assume shape. */
function normalizeQuantityBySize(
  raw: ProductSizesProps['quantityBySize']
): Array<{ sizeCode: string; quantity: number; sizeLabel?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { sizeCode?: string; quantity?: number; sizeLabel?: string } => s != null && typeof s === 'object')
    .map((s) => ({
      sizeCode: String(s.sizeCode ?? '').trim() || '—',
      quantity: Number(s.quantity ?? 0) || 0,
      sizeLabel: s.sizeLabel != null ? String(s.sizeLabel) : undefined,
    }))
    .filter((s) => s.sizeCode);
}

export function ProductSizes({
  sizeKind = 'na',
  quantityBySize,
  label,
  variant = 'default',
  className = '',
}: ProductSizesProps) {
  const kind = (sizeKind ?? 'na') as string;
  const list = normalizeQuantityBySize(quantityBySize);
  const hasSizes = kind === 'sized' && list.length > 0;
  const oneSize = kind === 'one_size';

  const content = hasSizes ? (
    <div className="flex flex-wrap gap-1.5" style={{ minHeight: SIZES_MIN_HEIGHT }}>
      {list.map((s) => (
        <span
          key={s.sizeCode}
          className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-sm font-medium shrink-0"
        >
          {s.sizeLabel ?? s.sizeCode}{' '}
          <span className="text-slate-500 font-normal ml-0.5">×{s.quantity}</span>
        </span>
      ))}
    </div>
  ) : oneSize ? (
    <span className="text-sm text-slate-600" style={{ minHeight: SIZES_MIN_HEIGHT, display: 'inline-block' }}>
      One size
    </span>
  ) : kind === 'sized' ? (
    <span className="text-sm text-slate-500" style={{ minHeight: SIZES_MIN_HEIGHT, display: 'inline-block' }}>
      Sized
    </span>
  ) : (
    <span className="text-sm text-slate-400" style={{ minHeight: SIZES_MIN_HEIGHT, display: 'inline-block' }}>
      —
    </span>
  );

  const wrapperClass =
    variant === 'compact'
      ? 'min-h-[40px] flex items-center'
      : 'pt-2 border-t border-slate-200/60 flex-shrink-0';

  return (
    <div className={`${wrapperClass} ${className}`.trim()} data-product-sizes>
      {label != null && (
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      )}
      {content}
    </div>
  );
}

/** Props from a Product (for use in table/grid). */
export interface ProductSizesFromProductProps {
  product: {
    sizeKind?: string;
    quantityBySize?: QuantityBySizeItem[] | Array<{ sizeCode?: string; quantity?: number; sizeLabel?: string }>;
  };
  label?: string;
  variant?: 'compact' | 'default';
  className?: string;
}

export function ProductSizesFromProduct({
  product,
  label,
  variant = 'default',
  className = '',
}: ProductSizesFromProductProps) {
  return (
    <ProductSizes
      sizeKind={product.sizeKind}
      quantityBySize={product.quantityBySize}
      label={label}
      variant={variant}
      className={className}
    />
  );
}
