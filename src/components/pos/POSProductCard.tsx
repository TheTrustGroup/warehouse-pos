// ============================================================
// POSProductCard.tsx
// File: warehouse-pos/src/components/pos/POSProductCard.tsx
//
// Compact product tile for the POS grid.
// Optimised for speed — one tap opens SizePickerSheet.
// No edit controls, no SKU, no location. Just what the
// cashier needs: image, name, price, stock status.
// ============================================================

import { safeProductImageUrl, EMPTY_IMAGE_DATA_URL } from '../../lib/imageUpload';
import { getProductImageUrl } from '../../lib/productImageUrl';
import { type POSProduct } from './SizePickerSheet';
import { LOW_STOCK_THRESHOLD } from '../../lib/stockConstants';

// ── Types ──────────────────────────────────────────────────────────────────

interface POSProductCardProps {
  product: POSProduct;
  onSelect: (product: POSProduct) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

type StockStatus = 'in' | 'low' | 'out';

/** Single derived quantity: sum of quantityBySize when present, else product.quantity. Use for both status and display. */
function getTotalQuantity(product: POSProduct): number {
  if ((product.quantityBySize?.length ?? 0) > 0) {
    return (product.quantityBySize ?? []).reduce((s, r) => s + r.quantity, 0);
  }
  return product.quantity ?? 0;
}

function getStockStatus(product: POSProduct): StockStatus {
  const qty = getTotalQuantity(product);
  if (qty === 0) return 'out';
  if (qty <= LOW_STOCK_THRESHOLD) return 'low';
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
  const qty = getTotalQuantity(product);
  const status = getStockStatus(product);
  const isOut = status === 'out';
  const firstImage = (product.images ?? [])[0];
  const safeSrc = firstImage ? safeProductImageUrl(firstImage) : '';
  const hasImage = safeSrc && safeSrc !== EMPTY_IMAGE_DATA_URL;

  const stockLabel = isOut ? 'Out of stock' : qty <= 5 ? `${qty} left` : `${qty} in stock`;

  return (
    <button
      type="button"
      disabled={isOut}
      onClick={() => onSelect(product)}
      className={`
        group w-full text-left
        bg-[var(--edk-surface)] rounded-[var(--edk-radius)] overflow-hidden
        border border-[var(--edk-border)]
        shadow-[0_1px_3px_rgba(0,0,0,0.06)]
        transition-all duration-150
        active:scale-[0.98]
        hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:-translate-y-0.5
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none disabled:hover:shadow-none
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edk-red)]
      `}
    >
      {/* Image: 1:1 square */}
      <div className="relative w-full aspect-square bg-[var(--edk-bg)] overflow-hidden">
        {hasImage ? (
          <img
            src={getProductImageUrl(safeSrc, 'medium')}
            alt={product.name}
            width={256}
            height={256}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ImagePlaceholder />
        )}
        {isOut && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-[11px] font-bold uppercase">Out of stock</span>
          </div>
        )}
        <StockBadge status={status} qty={qty} />
      </div>

      <div className="px-2.5 pt-2 pb-2.5">
        <p className="text-[12px] font-semibold text-[var(--edk-ink)] truncate mb-0.5">
          {product.name}
        </p>
        <p className="text-[15px] font-extrabold text-[var(--edk-red)] leading-none mb-0.5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {formatPrice(product.sellingPrice)}
        </p>
        <p className={`text-[10px] ${qty <= 5 && !isOut ? 'text-[var(--edk-amber)]' : 'text-[var(--edk-ink-3)]'}`}>
          {stockLabel}
        </p>
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
