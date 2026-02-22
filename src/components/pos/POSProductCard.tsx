// ============================================================
// POSProductCard.tsx
// File: warehouse-pos/src/components/pos/POSProductCard.tsx
//
// Compact product tile for the POS grid.
// Optimised for speed — one tap opens SizePickerSheet.
// No edit controls, no SKU, no location. Just what the
// cashier needs: image, name, price, stock status.
// ============================================================

import { type POSProduct } from './SizePickerSheet';

// ── Types ──────────────────────────────────────────────────────────────────

interface POSProductCardProps {
  product: POSProduct;
  onSelect: (product: POSProduct) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

type StockStatus = 'in' | 'low' | 'out';

function getStockStatus(product: POSProduct): StockStatus {
  if (product.quantity === 0) return 'out';
  if (product.quantity <= 3) return 'low';
  return 'in';
}

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Stock Badge ────────────────────────────────────────────────────────────

function StockBadge({ status, qty }: { status: StockStatus; qty: number }) {
  if (status === 'in') return null; // no badge when in stock — clean card

  const config = {
    low: { label: `${qty} left`, cls: 'bg-amber-400/90 text-white' },
    out: { label: 'Out',         cls: 'bg-red-500/90 text-white' },
  }[status];

  return (
    <span className={`
      absolute top-2 right-2
      h-5 px-2 rounded-full
      text-[10px] font-bold tracking-wide
      backdrop-blur-sm
      ${config.cls}
    `}>
      {config.label}
    </span>
  );
}

// ── Image Placeholder ──────────────────────────────────────────────────────

function ImagePlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-slate-300">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function POSProductCard({ product, onSelect }: POSProductCardProps) {
  const status = getStockStatus(product);
  const isOut = status === 'out';
  const hasImage = Array.isArray(product.images) && product.images.length > 0;

  return (
    <button
      type="button"
      disabled={isOut}
      onClick={() => onSelect(product)}
      className={`
        group w-full text-left
        bg-white rounded-2xl overflow-hidden
        border border-slate-100
        shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)]
        transition-all duration-150
        active:scale-[0.96] active:shadow-none
        hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:-translate-y-0.5
        disabled:opacity-40 disabled:cursor-not-allowed
        disabled:hover:transform-none disabled:hover:shadow-none
        focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400
      `}
    >
      {/* Image */}
      <div className="relative w-full pt-[100%] bg-slate-50 overflow-hidden">
        {hasImage ? (
          <img
            src={(product.images ?? [])[0]}
            alt={product.name}
            loading="lazy"
            className="
              absolute inset-0 w-full h-full object-cover
              transition-transform duration-300
              group-hover:scale-105
            "
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Stock badge — only low/out */}
        <StockBadge status={status} qty={product.quantity} />
      </div>

      {/* Body */}
      <div className="px-3 pt-2.5 pb-3">
        {/* Name */}
        <p className="
          text-[13px] font-bold text-slate-900
          leading-snug mb-1
          line-clamp-2 min-h-[2.5em]
        ">
          {product.name}
        </p>

        {/* Category */}
        <p className="text-[11px] text-slate-400 font-medium mb-2">
          {product.category ?? ''}
        </p>

        {/* Price + stock row */}
        <div className="flex items-end justify-between gap-1">
          <span className="text-[15px] font-extrabold text-red-500 leading-none">
            {formatPrice(product.sellingPrice)}
          </span>

          {/* Size indicator for sized products */}
          {product.sizeKind === 'sized' && !isOut && (
            <span className="
              text-[10px] font-semibold text-slate-400
              bg-slate-100 px-1.5 py-0.5 rounded-md
              leading-none flex-shrink-0
            ">
              {(product.quantityBySize ?? []).filter(r => r.quantity > 0).length} sizes
            </span>
          )}

          {/* Qty badge for non-sized products */}
          {product.sizeKind !== 'sized' && !isOut && (
            <span className="
              text-[10px] font-semibold text-slate-400
              bg-slate-100 px-1.5 py-0.5 rounded-md
              leading-none flex-shrink-0
            ">
              {product.quantity} left
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

export function POSProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="w-full pt-[100%] bg-slate-100 animate-pulse" />
      <div className="px-3 pt-2.5 pb-3 flex flex-col gap-2">
        <div className="h-3.5 w-4/5 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-3 w-1/2 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-4 w-2/3 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}
