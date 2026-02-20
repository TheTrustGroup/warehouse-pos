// ============================================================
// SizePickerSheet.tsx
// File: warehouse-pos/src/components/pos/SizePickerSheet.tsx
//
// Bottom sheet that appears when a cashier taps a product.
// Handles 3 product types: sized, one_size, na
// Fully controlled — parent owns state.
// ============================================================

import { useState, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SizeRow {
  sizeCode: string;
  quantity: number;
  sizeLabel?: string;
}

export interface POSProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  sizeKind: 'na' | 'one_size' | 'sized';
  quantity: number;
  quantityBySize: SizeRow[];
  images?: string[];
}

export interface CartLineInput {
  productId: string;
  name: string;
  sku: string;
  sizeCode: string | null;   // null for na/one_size products
  sizeLabel: string | null;
  unitPrice: number;
  qty: number;
}

interface SizePickerSheetProps {
  product: POSProduct | null;       // null = closed
  onAdd: (line: CartLineInput) => void;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getStockForSize(product: POSProduct, sizeCode: string): number {
  return product.quantityBySize.find(r => r.sizeCode === sizeCode)?.quantity ?? 0;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── Size Button ────────────────────────────────────────────────────────────

interface SizeBtnProps {
  sizeCode: string;
  stock: number;
  selected: boolean;
  onSelect: () => void;
}

function SizeBtn({ sizeCode, stock, selected, onSelect }: SizeBtnProps) {
  const isOut = stock === 0;
  const isLow = stock > 0 && stock <= 3;

  return (
    <button
      type="button"
      disabled={isOut}
      onClick={onSelect}
      className={`
        relative flex flex-col items-center justify-center
        min-w-[64px] h-[52px] px-3 rounded-xl
        border-[1.5px] font-sans text-[13px] font-bold
        transition-all duration-150 active:scale-95
        disabled:opacity-30 disabled:cursor-not-allowed
        ${selected
          ? 'bg-slate-900 border-slate-900 text-white'
          : isOut
            ? 'bg-slate-50 border-slate-200 text-slate-300'
            : 'bg-white border-slate-200 text-slate-700 hover:border-red-400 hover:text-red-500 hover:bg-red-50'
        }
      `}
    >
      <span>{sizeCode}</span>
      <span className={`
        text-[10px] font-medium leading-none mt-0.5
        ${selected ? 'text-white/60' : isLow ? 'text-amber-500' : 'text-slate-400'}
      `}>
        {isOut ? 'Out' : isLow ? `${stock} left` : `${stock}`}
      </span>

      {/* Low stock indicator dot */}
      {isLow && !selected && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
      )}
    </button>
  );
}

// ── Qty Stepper ────────────────────────────────────────────────────────────

interface QtyStepperProps {
  value: number;
  max?: number;
  onChange: (val: number) => void;
}

function QtyStepper({ value, max, onChange }: QtyStepperProps) {
  const atMax = max !== undefined && value >= max;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="
          w-10 h-10 rounded-xl border-[1.5px] border-slate-200 bg-white
          text-[20px] font-semibold text-slate-600
          flex items-center justify-center
          hover:bg-slate-100 active:scale-90
          disabled:opacity-30 disabled:cursor-not-allowed
          transition-all duration-150
        "
      >
        −
      </button>

      <span className="text-[24px] font-bold text-slate-900 min-w-[32px] text-center tabular-nums">
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={atMax}
        className="
          w-10 h-10 rounded-xl border-[1.5px] border-slate-200 bg-white
          text-[20px] font-semibold text-slate-600
          flex items-center justify-center
          hover:bg-slate-100 active:scale-90
          disabled:opacity-30 disabled:cursor-not-allowed
          transition-all duration-150
        "
      >
        +
      </button>

      {max !== undefined && (
        <span className="text-[12px] text-slate-400 font-medium">
          of {max}
        </span>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SizePickerSheet({
  product,
  onAdd,
  onClose,
}: SizePickerSheetProps) {

  const isOpen = product !== null;
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Reset when product changes
  useEffect(() => {
    if (product) {
      setQty(1);
      // Auto-select if only one size available
      if (product.sizeKind === 'sized') {
        const available = product.quantityBySize.filter(r => r.quantity > 0);
        setSelectedSize(available.length === 1 ? available[0].sizeCode : null);
      } else {
        setSelectedSize(null);
      }
    }
  }, [product?.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Trap body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const isSized = product?.sizeKind === 'sized';
  const canAdd = !isSized || selectedSize !== null;

  const maxQty = (() => {
    if (!product) return undefined;
    if (product.sizeKind === 'sized' && selectedSize) {
      return getStockForSize(product, selectedSize);
    }
    return product.quantity;
  })();

  const lineTotal = product ? product.sellingPrice * qty : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleAdd() {
    if (!product || !canAdd) return;

    const sizeRow = selectedSize
      ? product.quantityBySize.find(r => r.sizeCode === selectedSize)
      : null;

    onAdd({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      sizeCode: selectedSize,
      sizeLabel: sizeRow?.sizeLabel ?? selectedSize,
      unitPrice: product.sellingPrice,
      qty,
    });

    onClose();
  }

  function handleSizeSelect(code: string) {
    setSelectedSize(prev => prev === code ? null : code);
    // Reset qty if switching sizes (different stock limits)
    setQty(1);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-40 transition-all duration-250
          ${isOpen ? 'bg-black/40 backdrop-blur-[2px] pointer-events-auto' : 'bg-transparent pointer-events-none'}
        `}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`
          fixed bottom-0 left-0 right-0 z-50
          bg-white rounded-t-[24px]
          shadow-[0_-8px_40px_rgba(0,0,0,0.12)]
          flex flex-col
          max-h-[88vh]
          transition-transform duration-300 ease-[cubic-bezier(0.34,1.1,0.64,1)]
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto overscroll-contain flex-1">

          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-2 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-[18px] font-bold text-slate-900 leading-tight">
                {product?.name ?? ''}
              </h3>
              <p className="text-[15px] font-semibold text-red-500 mt-1">
                {product ? formatPrice(product.sellingPrice) : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="
                w-9 h-9 rounded-xl border border-slate-200 bg-slate-50
                text-slate-400 flex items-center justify-center
                hover:bg-slate-100 hover:text-slate-600
                transition-all duration-150 flex-shrink-0 mt-0.5
              "
            >
              <IconX />
            </button>
          </div>

          {/* Size grid — only for sized products */}
          {product?.sizeKind === 'sized' && (
            <div className="px-5 pt-4 pb-2">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                Select size
              </p>
              <div className="flex flex-wrap gap-2">
                {product.quantityBySize.map(row => (
                  <SizeBtn
                    key={row.sizeCode}
                    sizeCode={row.sizeCode}
                    stock={row.quantity}
                    selected={selectedSize === row.sizeCode}
                    onSelect={() => handleSizeSelect(row.sizeCode)}
                  />
                ))}
              </div>

              {/* No size selected hint */}
              {!selectedSize && (
                <p className="text-[12px] text-slate-400 mt-3">
                  Tap a size to continue
                </p>
              )}
            </div>
          )}

          {/* One size / no size label */}
          {product?.sizeKind === 'one_size' && (
            <div className="px-5 pt-4 pb-2">
              <span className="
                inline-flex items-center h-7 px-3 rounded-lg
                bg-slate-100 text-[12px] font-semibold text-slate-600
              ">
                One size
              </span>
            </div>
          )}

          {/* Qty stepper */}
          <div className="px-5 py-4 border-t border-slate-100 mt-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-slate-600">Quantity</p>
              <QtyStepper
                value={qty}
                max={maxQty}
                onChange={setQty}
              />
            </div>
          </div>

          {/* Line total */}
          {product && (
            <div className="px-5 pb-4">
              <div className="
                flex items-center justify-between
                px-4 py-3 rounded-xl bg-slate-50
                border border-slate-200
              ">
                <span className="text-[13px] font-semibold text-slate-500">
                  {qty} × {formatPrice(product.sellingPrice)}
                </span>
                <span className="text-[17px] font-bold text-slate-900">
                  {formatPrice(lineTotal)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sticky add button */}
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="
              w-full h-14 rounded-2xl border-none
              bg-red-500 hover:bg-red-600
              text-white text-[16px] font-bold
              flex items-center justify-center gap-2.5
              disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed
              active:scale-[0.98]
              transition-all duration-150
            "
          >
            <IconPlus />
            {canAdd
              ? `Add to cart · ${formatPrice(lineTotal)}`
              : 'Select a size to continue'
            }
          </button>
        </div>

        {/* Safe area spacer */}
        <div className="h-safe-area-inset-bottom flex-shrink-0" />
      </div>

      <style>{`
        @keyframes sheetIn {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
