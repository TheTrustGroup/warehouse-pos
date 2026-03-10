// ============================================================
// ProductCard.tsx
// File: warehouse-pos/src/components/inventory/ProductCard.tsx
//
// Displays a single product as a card.
// Two modes: view (default) and inline stock edit.
// Parent controls which card is in edit mode via activeEditId.
// ============================================================

import { useState, useRef, useCallback } from 'react';
import type { Product } from '../../types';
import type { QuantityBySizeItem } from '../../types';
import { LOW_STOCK_THRESHOLD } from '../../lib/stockConstants';
import { getProductImageUrl } from '../../lib/productImageUrl';
import { LoadingSpinner } from '../ui/LoadingSpinner';

// ── Types ──────────────────────────────────────────────────────────────────

export type { Product };
export type SizeRow = QuantityBySizeItem;

interface ProductCardProps {
  product: Product;
  /** When omitted, card is view-only (no inline stock edit). */
  isEditing?: boolean;
  onEditOpen?: (id: string) => void;
  onEditClose?: () => void;
  onSaveStock?: (id: string, update: {
    quantity: number;
    quantityBySize: SizeRow[];
    sizeKind: 'na' | 'one_size' | 'sized';
  }) => Promise<void>;
  onEditFull: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

type StockStatus = 'in' | 'low' | 'out';

/** Derive quantity from actual data: sum of quantityBySize when present, else product.quantity. */
function getTotalQuantity(product: Product): number {
  if ((product.quantityBySize?.length ?? 0) > 0) {
    return (product.quantityBySize ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  }
  return product.quantity ?? 0;
}

function getStockStatus(product: Product): StockStatus {
  const qty = getTotalQuantity(product);
  if (qty === 0) return 'out';
  const threshold = product.reorderLevel ?? LOW_STOCK_THRESHOLD;
  if (qty <= threshold) return 'low';
  return 'in';
}

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconImage = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

// ── Stock Status Badge ─────────────────────────────────────────────────────

function StockBadge({ status }: { status: StockStatus }) {
  const config = {
    in:  { label: 'In stock',     cls: 'bg-white/92 text-[var(--edk-green)] border-[rgba(22,163,74,0.2)]', dot: 'bg-[var(--edk-green)]' },
    low: { label: 'Low stock',    cls: 'bg-white/92 text-[var(--edk-amber)] border-[rgba(217,119,6,0.3)]', dot: 'bg-[var(--edk-amber)]' },
    out: { label: 'Out of stock', cls: 'bg-white/92 text-red-600 border-red-200', dot: 'bg-red-500' },
  }[status];

  return (
    <span className={`
      absolute top-2 right-2
      flex items-center gap-1 h-5 px-1.5 rounded border text-[10px] font-semibold
      ${config.cls}
    `}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ── Size Pills ─────────────────────────────────────────────────────────────

function SizePills({ product }: { product: Product }) {
  if (product.sizeKind === 'na') {
    return (
      <div className="flex items-center gap-1.5 mb-2">
        <span className="h-6 px-2 rounded bg-[var(--edk-bg)] border border-[var(--edk-border-mid)] text-[10px] font-semibold text-[var(--edk-ink-2)] flex items-center">
          Qty: {product.quantity}
        </span>
      </div>
    );
  }

  if (product.sizeKind === 'one_size') {
    return (
      <div className="flex items-center gap-1.5 mb-2">
        <span className="h-6 px-2 rounded bg-[var(--edk-bg)] border border-[var(--edk-border-mid)] text-[10px] font-semibold text-[var(--edk-ink-2)] flex items-center">
          One size · {product.quantity}
        </span>
      </div>
    );
  }

  const sizeRows = product.quantityBySize ?? [];
  // When API says sized but returned no size rows, show "One size · N" if we have quantity (avoids "No sizes recorded" when stock exists).
  if (sizeRows.length === 0) {
    const qty = product.quantity ?? 0;
    if (qty > 0) {
      return (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="h-6 px-2 rounded bg-[var(--edk-bg)] border border-[var(--edk-border-mid)] text-[10px] font-semibold text-[var(--edk-ink-2)] flex items-center">
            One size · {qty}
          </span>
        </div>
      );
    }
    return (
      <div className="mb-2">
        <span className="text-[11px] text-[var(--edk-ink-3)] italic">No sizes recorded</span>
      </div>
    );
  }

  const reorder = product.reorderLevel ?? LOW_STOCK_THRESHOLD;

  return (
    <div className="flex flex-wrap gap-1 overflow-x-auto pb-2 scrollbar-none">
      {sizeRows.map((row) => {
        const isLow = row.quantity > 0 && row.quantity <= reorder;
        return (
          <span
            key={row.sizeCode}
            className={`
              flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5
              border border-[var(--edk-border-mid)]
              ${isLow ? 'bg-[var(--edk-amber-bg)] border-[rgba(217,119,6,0.3)] text-[var(--edk-amber)]' : 'bg-[var(--edk-bg)] text-[var(--edk-ink-2)]'}
            `}
          >
            {row.sizeCode}
            <span className="font-normal text-[var(--edk-ink-3)]">·{row.quantity}</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Inline Stock Editor ────────────────────────────────────────────────────

interface StockEditorProps {
  product: Product;
  onSave: (update: { quantity: number; quantityBySize: SizeRow[]; sizeKind: 'na' | 'one_size' | 'sized' }) => Promise<void>;
  onCancel: () => void;
}

function StockEditor({ product, onSave, onCancel }: StockEditorProps) {
  // Initialize local rows from product
  const [rows, setRows] = useState<SizeRow[]>(() => {
    if (product.sizeKind === 'sized' && (product.quantityBySize ?? []).length > 0) {
      return (product.quantityBySize ?? []).map(r => ({ ...r }));
    }
    return [{ sizeCode: product.sizeKind === 'one_size' ? 'ONE_SIZE' : 'QTY', quantity: product.quantity }];
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const updateQty = useCallback((idx: number, val: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Math.max(0, val) } : r));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const isSized = product.sizeKind === 'sized';
      const total = rows.reduce((s, r) => s + r.quantity, 0);
      await onSave({
        sizeKind: (product.sizeKind ?? 'na') as 'na' | 'one_size' | 'sized',
        quantity: total,
        quantityBySize: isSized ? rows : [],
      });
      setSaved(true);
      setTimeout(() => onCancel(), 800);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Update stock
      </p>

      <div className="flex flex-col gap-1">
        {rows.map((row, idx) => (
          <div key={row.sizeCode} className="grid grid-cols-[1fr_96px] gap-2 items-center py-1.5 border-b border-slate-100 last:border-0">
            <div>
              <p className="text-[14px] font-semibold text-slate-700">
                {product.sizeKind === 'sized' ? row.sizeCode : product.sizeKind === 'one_size' ? 'One size' : 'Quantity'}
              </p>
              <p className="text-[11px] text-slate-400">Was: {product.sizeKind === 'sized'
                ? ((product.quantityBySize ?? []).find(r => r.sizeCode === row.sizeCode)?.quantity ?? 0)
                : product.quantity
              }</p>
            </div>
            <input
              ref={idx === 0 ? firstInputRef : undefined}
              type="number"
              min={0}
              value={row.quantity}
              onChange={e => updateQty(idx, parseInt(e.target.value) || 0)}
              onFocus={e => e.target.select()}
              className="
                h-11 w-full rounded-xl border-[1.5px] border-slate-200
                bg-slate-50 text-center
                text-[18px] font-bold text-slate-900
                focus:outline-none focus:border-red-400 focus:bg-white focus:ring-[3px] focus:ring-red-100
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                [&::-webkit-inner-spin-button]:appearance-none
                transition-all duration-150
              "
            />
          </div>
        ))}
      </div>

      {/* Total for sized products */}
      {product.sizeKind === 'sized' && rows.length > 1 && (
        <div className="flex justify-between items-center pt-2.5 mt-1">
          <span className="text-[12px] font-semibold text-slate-500">Total</span>
          <span className="text-[15px] font-bold text-slate-900">
            {rows.reduce((s, r) => s + r.quantity, 0)} units
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="
            h-11 rounded-xl border-[1.5px] border-slate-200
            text-[14px] font-semibold text-slate-500
            bg-white hover:bg-slate-50
            disabled:opacity-40
            transition-all duration-150
          "
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || saved}
          className={`
            h-11 rounded-xl border-none
            text-[14px] font-semibold text-white
            flex items-center justify-center gap-2
            disabled:opacity-60
            transition-all duration-200
            ${saved ? 'bg-emerald-500' : 'bg-red-500 hover:bg-red-600 active:scale-[0.98]'}
          `}
        >
          {saving ? <><LoadingSpinner size="sm" /> Saving…</> : saved ? '✓ Saved' : 'Save stock'}
        </button>
      </div>
    </div>
  );
}

// ── Main Card Component ────────────────────────────────────────────────────

export default function ProductCard({
  product,
  isEditing = false,
  onEditOpen,
  onEditClose,
  onSaveStock,
  onEditFull,
  onDelete,
}: ProductCardProps) {
  const supportsInlineStock = typeof onSaveStock === 'function' && typeof onEditOpen === 'function' && typeof onEditClose === 'function';
  const editing = supportsInlineStock && isEditing;

  const status = getStockStatus(product);
  const hasImage = Array.isArray(product.images) && product.images.length > 0;
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const showImage = hasImage && !imageLoadFailed;
  const isOutOfStock = status === 'out';
  const isLowStock = status === 'low';

  return (
    <article
      className={`
        group bg-[var(--edk-surface)] rounded-[10px] overflow-hidden border border-[var(--edk-border)]
        shadow-[0_1px_3px_rgba(0,0,0,0.06)]
        transition-all duration-200
        ${editing ? 'ring-2 ring-[var(--edk-red)]' : ''}
        ${!editing && isOutOfStock ? 'border-red-200 opacity-95' : ''}
        ${!editing && isLowStock && !isOutOfStock ? 'border-[rgba(217,119,6,0.25)]' : ''}
        ${!editing ? 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:-translate-y-0.5' : ''}
      `}
    >
      {/* Image: 4:3 aspect, hover scale — thumb size for list/grid (CDN-ready). Fallback to placeholder on load error. */}
      <div className="relative w-full aspect-[4/3] bg-[var(--edk-bg)] overflow-hidden">
        {showImage ? (
          <img
            src={getProductImageUrl(product.images![0], 'thumb')}
            alt={product.name}
            width={320}
            height={240}
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${isOutOfStock ? 'opacity-60' : ''}`}
            loading="lazy"
            decoding="async"
            onError={() => setImageLoadFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--edk-ink-3)]">
            <IconImage />
          </div>
        )}

        {/* Out-of-stock overlay: clear visual signal so cards never look in-stock when they are not */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
            <span className="text-white text-[11px] font-bold uppercase tracking-wider drop-shadow-sm">
              Out of stock
            </span>
          </div>
        )}

        {/* Category tag: top-left, dark backdrop */}
        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/70 text-white/90">
          {product.category}
        </span>

        <StockBadge status={status} />
      </div>

      {/* Card body */}
      {!editing && (
        <div className="px-3.5 pt-3 pb-2">
          <h3 className="text-[13px] font-semibold text-[var(--edk-ink)] truncate mb-0.5">
            {product.name}
          </h3>
          <p className="font-mono text-[10px] text-[var(--edk-ink-3)] mb-2">
            {product.sku}
          </p>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-[17px] font-extrabold text-[var(--edk-red)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {formatPrice(product.sellingPrice)}
            </span>
            {product.costPrice > 0 && (
              <span className="text-[11px] text-[var(--edk-ink-3)]">
                Cost: {formatPrice(product.costPrice)}
              </span>
            )}
          </div>

          <SizePills product={product} />
        </div>
      )}

      {/* ── Inline stock editor ── */}
      {editing && onSaveStock && onEditClose && (
        <StockEditor
          product={product}
          onSave={onSaveStock.bind(null, product.id)}
          onCancel={onEditClose}
        />
      )}

      {/* Actions: Edit + Delete outlined, 30px height */}
      {!editing && (
        <div className={`flex gap-1.5 px-3.5 py-2 border-t border-[var(--edk-border)] ${supportsInlineStock ? '' : ''}`}>
          <button
            type="button"
            onClick={() => onEditFull(product)}
            className="flex-1 h-[30px] flex items-center justify-center gap-1 rounded-[var(--edk-radius-sm)] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[12px] font-medium text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)] transition-colors"
          >
            <IconEdit /> Edit
          </button>
          {supportsInlineStock && (
            <button
              type="button"
              onClick={() => onEditOpen?.(product.id)}
              className="h-[30px] flex items-center justify-center gap-1 px-2 rounded-[var(--edk-radius-sm)] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[12px] font-medium text-[var(--edk-red)] hover:bg-red-50 transition-colors"
            >
              <IconPlus /> Stock
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete?.(product)}
            className="h-[30px] flex items-center justify-center min-w-[30px] rounded-[var(--edk-radius-sm)] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[var(--edk-ink-2)] hover:bg-[#FEF2F2] hover:text-red-600 hover:border-red-200 transition-colors"
            aria-label="Delete product"
            title="Delete product"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      )}

    </article>
  );
}

// ── Skeleton Card ──────────────────────────────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] shadow-sm">
      <div className="w-full pt-[56.25%] bg-[var(--edk-border-mid)] animate-pulse" />
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <div className="h-4 w-3/4 rounded-lg bg-[var(--edk-border-mid)] animate-pulse" />
        <div className="h-3 w-1/2 rounded-lg bg-[var(--edk-border-mid)] animate-pulse" />
        <div className="h-5 w-1/3 rounded-lg bg-[var(--edk-border-mid)] animate-pulse" />
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-16 rounded-lg bg-[var(--edk-border-mid)] animate-pulse" />
          ))}
        </div>
      </div>
      <div className="h-12 border-t border-[var(--edk-border)] bg-[var(--edk-surface-2)] animate-pulse" />
    </div>
  );
}
