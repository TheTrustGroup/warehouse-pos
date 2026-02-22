// ============================================================
// ProductCard.tsx
// File: warehouse-pos/src/components/inventory/ProductCard.tsx
//
// Displays a single product as a card.
// Two modes: view (default) and inline stock edit.
// Parent controls which card is in edit mode via activeEditId.
// ============================================================

import { useState, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SizeRow {
  sizeCode: string;
  quantity: number;
  sizeLabel?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  quantity: number;
  sizeKind: 'na' | 'one_size' | 'sized';
  quantityBySize: SizeRow[];
  location?: { aisle?: string; rack?: string; bin?: string; warehouse?: string };
  images?: string[];
  reorderLevel?: number;
}

interface ProductCardProps {
  product: Product;
  /** When omitted, card is view-only (no inline stock edit). */
  isEditing?: boolean;
  onEditOpen?: (id: string) => void;
  onEditClose?: () => void;
  onSaveStock?: (id: string, update: {
    quantity: number;
    quantityBySize: SizeRow[];
    sizeKind: string;
  }) => Promise<void>;
  onEditFull: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

type StockStatus = 'in' | 'low' | 'out';

function getTotalQuantity(product: Product): number {
  if (product.sizeKind === 'sized' && (product.quantityBySize?.length ?? 0) > 0) {
    return (product.quantityBySize ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  }
  return product.quantity ?? 0;
}

function getStockStatus(product: Product): StockStatus {
  const qty = getTotalQuantity(product);
  if (qty === 0) return 'out';
  if (product.reorderLevel != null && qty <= product.reorderLevel) return 'low';
  if (qty <= 3) return 'low';
  return 'in';
}

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getLocationString(location?: Product['location']): string {
  if (!location) return '';
  return [location.aisle, location.rack, location.bin].filter(Boolean).join(' · ');
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

const IconPin = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconImage = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

const IconSpinner = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ animation: 'card-spin 0.8s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

// ── Stock Status Badge ─────────────────────────────────────────────────────

function StockBadge({ status }: { status: StockStatus }) {
  const config = {
    in:  { label: 'In stock',     cls: 'bg-emerald-500/15 text-emerald-800', dot: 'bg-emerald-500' },
    low: { label: 'Low stock',    cls: 'bg-amber-500/15 text-amber-800',     dot: 'bg-amber-500' },
    out: { label: 'Out of stock', cls: 'bg-red-500/15 text-red-700',         dot: 'bg-red-500' },
  }[status];

  return (
    <span className={`
      absolute top-2.5 right-2.5
      flex items-center gap-1.5 h-6 px-2.5 rounded-full
      text-[11px] font-semibold backdrop-blur-sm
      bg-white/80 border border-white/60
      ${config.cls}
    `}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ── Size Pills ─────────────────────────────────────────────────────────────

function SizePills({ product }: { product: Product }) {
  if (product.sizeKind === 'na') {
    return (
      <div className="flex items-center gap-1.5 mb-3">
        <span className="h-7 px-3 rounded-lg bg-slate-100 text-[12px] font-semibold text-slate-600 flex items-center">
          Qty: {product.quantity}
        </span>
      </div>
    );
  }

  if (product.sizeKind === 'one_size') {
    return (
      <div className="flex items-center gap-1.5 mb-3">
        <span className="h-7 px-3 rounded-lg bg-slate-100 text-[12px] font-semibold text-slate-600 flex items-center">
          One size · {product.quantity}
        </span>
      </div>
    );
  }

  if (product.quantityBySize.length === 0) {
    return (
      <div className="mb-3">
        <span className="text-[12px] text-slate-300 italic">No sizes recorded</span>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-none">
      {product.quantityBySize.map(row => (
        <span
          key={row.sizeCode}
          className={`
            flex-shrink-0 h-7 px-2.5 rounded-lg
            text-[12px] font-semibold flex items-center gap-1
            ${row.quantity > 0
              ? 'bg-slate-100 text-slate-700'
              : 'bg-slate-50 text-slate-300 border border-slate-200'
            }
          `}
        >
          {row.sizeCode}
          <span className={`font-medium ${row.quantity > 0 ? 'text-slate-400' : 'text-slate-300'}`}>
            · {row.quantity}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Inline Stock Editor ────────────────────────────────────────────────────

interface StockEditorProps {
  product: Product;
  onSave: (update: { quantity: number; quantityBySize: SizeRow[]; sizeKind: string }) => Promise<void>;
  onCancel: () => void;
}

function StockEditor({ product, onSave, onCancel }: StockEditorProps) {
  // Initialize local rows from product
  const [rows, setRows] = useState<SizeRow[]>(() => {
    if (product.sizeKind === 'sized' && product.quantityBySize.length > 0) {
      return product.quantityBySize.map(r => ({ ...r }));
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
        sizeKind: product.sizeKind,
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
                ? (product.quantityBySize.find(r => r.sizeCode === row.sizeCode)?.quantity ?? 0)
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
          {saving ? <><IconSpinner /> Saving…</> : saved ? '✓ Saved' : 'Save stock'}
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
  const locationStr = getLocationString(product.location);
  const hasImage = Array.isArray(product.images) && product.images.length > 0;

  return (
    <article
      className={`
        bg-white rounded-2xl overflow-hidden
        shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.06)]
        transition-all duration-200
        ${editing
          ? 'ring-2 ring-red-400 shadow-[0_4px_8px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.10)]'
          : 'hover:shadow-[0_4px_8px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.10)] hover:-translate-y-0.5'
        }
      `}
    >
      {/* ── Image area ── */}
      <div className="relative w-full pt-[56.25%] bg-slate-100 overflow-hidden">
        {hasImage ? (
          <img
            src={product.images![0]}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <IconImage />
          </div>
        )}

        {/* Category badge */}
        <span className="absolute top-2.5 left-2.5 h-6 px-2.5 rounded-full bg-white/85 backdrop-blur-sm border border-white/60 text-[11px] font-semibold text-slate-700">
          {product.category}
        </span>

        {/* Stock badge */}
        <StockBadge status={status} />
      </div>

      {/* ── Card body (hidden when editing) ── */}
      {!editing && (
        <div className="px-4 pt-3.5">
          {/* Name */}
          <h3 className="text-[15px] font-bold text-slate-900 truncate leading-snug mb-1">
            {product.name}
          </h3>

          {/* SKU + location */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className="font-mono text-[11px] text-slate-400 truncate">
              {product.sku}
            </span>
            {locationStr && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <IconPin /> {locationStr}
              </span>
            )}
          </div>

          {/* Price row */}
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className="text-[17px] font-bold text-red-500">
              {formatPrice(product.sellingPrice)}
            </span>
            {product.costPrice > 0 && (
              <span className="text-[12px] text-slate-400">
                Cost: {formatPrice(product.costPrice)}
              </span>
            )}
          </div>

          {/* Size pills */}
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

      {/* ── Footer (hidden when editing) ── */}
      {!editing && (
        <div className={`grid border-t border-slate-100 ${supportsInlineStock ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button
            type="button"
            onClick={() => onEditFull(product)}
            className="
              h-12 flex items-center justify-center gap-1
              text-[13px] font-semibold text-slate-500
              border-r border-slate-100
              hover:bg-slate-50 hover:text-slate-700
              transition-colors duration-150
            "
          >
            <IconEdit /> Edit
          </button>
          {supportsInlineStock && (
            <button
              type="button"
              onClick={() => onEditOpen?.(product.id)}
              className="
                h-12 flex items-center justify-center gap-1
                text-[13px] font-semibold text-red-500
                border-r border-slate-100
                hover:bg-red-50
                transition-colors duration-150
              "
            >
              <IconPlus /> Stock
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete?.(product)}
            className="
              h-12 flex items-center justify-center
              text-slate-400
              hover:bg-red-50 hover:text-red-500
              transition-colors duration-150
            "
            aria-label="Delete product"
            title="Delete product"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      )}

      <style>{`
        @keyframes card-spin { to { transform: rotate(360deg); } }
      `}</style>
    </article>
  );
}

// ── Skeleton Card ──────────────────────────────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.06)]">
      <div className="w-full pt-[56.25%] bg-slate-100 animate-pulse" />
      <div className="px-4 pt-3.5 pb-4 flex flex-col gap-2.5">
        <div className="h-4 w-3/4 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-3 w-1/2 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-5 w-1/3 bg-slate-100 rounded-lg animate-pulse" />
        <div className="flex gap-1.5">
          {[1,2,3].map(i => (
            <div key={i} className="h-7 w-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
      <div className="h-12 border-t border-slate-100 bg-slate-50 animate-pulse" />
    </div>
  );
}
