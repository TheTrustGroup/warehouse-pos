import { useState } from 'react';

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  sku: string;
  sizeCode: string | null;
  sizeLabel: string | null;
  unitPrice: number;
  qty: number;
  /** Product image URL for receipt / API (e.g. first of warehouse_products.images). */
  imageUrl?: string | null;
}

export interface SalePayload {
  warehouseId: string;
  customerName?: string | null;
  paymentMethod: string;
  subtotal: number;
  discountPct: number;
  discountAmt: number;
  total: number;
  lines: Array<{
    productId: string;
    sizeCode: string | null;
    qty: number;
    unitPrice: number;
    name: string;
    sku: string;
    sizeLabel?: string | null;
    imageUrl?: string | null;
  }>;
}

interface CartSheetProps {
  isOpen: boolean;
  lines: CartLine[];
  warehouseId: string;
  onUpdateQty: (key: string, delta: number) => void;
  onRemoveLine: (key: string) => void;
  onClearCart: () => void;
  onCharge: (payload: SalePayload) => void | Promise<void>;
  onClose: () => void;
}

const PAYMENT_OPTIONS = ['cash', 'card', 'mobile_money', 'mixed'] as const;

export default function CartSheet({
  isOpen,
  lines,
  warehouseId,
  onUpdateQty,
  onRemoveLine,
  onClearCart,
  onCharge,
  onClose,
}: CartSheetProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [customerName, setCustomerName] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [charging, setCharging] = useState(false);

  if (!isOpen) return null;

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discountAmt = (subtotal * discountPct) / 100;
  const total = Math.max(0, subtotal - discountAmt);

  const handleCharge = async () => {
    if (!warehouseId || lines.length === 0 || charging) return;
    setCharging(true);
    try {
      await onCharge({
        warehouseId,
        customerName: customerName.trim() || null,
        paymentMethod,
        subtotal,
        discountPct,
        discountAmt,
        total,
        lines: lines.map((l) => ({
          productId: l.productId,
          sizeCode: l.sizeCode,
          qty: l.qty,
          unitPrice: l.unitPrice,
          name: l.name,
          sku: l.sku,
          sizeLabel: l.sizeLabel,
          imageUrl: l.imageUrl ?? null,
        })),
      });
    } finally {
      setCharging(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50" onClick={onClose} aria-hidden />
      {/* On mobile: full-screen drawer; on desktop: 90vh rounded sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[100dvh] lg:max-h-[90vh] overflow-y-auto rounded-t-2xl lg:rounded-t-2xl bg-[var(--edk-surface)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--edk-border)] bg-[var(--edk-surface)] px-4 py-3">
          <h3 className="text-[14px] font-extrabold uppercase tracking-wide text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Current Sale
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClearCart}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg px-3 py-2 text-[12px] font-medium text-[var(--edk-ink-3)] hover:bg-[var(--edk-bg)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--edk-ink-3)] hover:bg-[var(--edk-bg)]"
              aria-label="Close cart"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--edk-bg)] p-3">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--edk-ink)] text-[13px]">{l.name}</span>
                  {l.sizeLabel && <span className="ml-1 text-[11px] text-[var(--edk-ink-3)]">({l.sizeLabel})</span>}
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateQty(l.key, -1)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded border border-[var(--edk-border-mid)] text-[14px] font-semibold touch-manipulation"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-[13px] font-semibold">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQty(l.key, 1)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded border border-[var(--edk-border-mid)] text-[14px] font-semibold touch-manipulation"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveLine(l.key)}
                      className="ml-2 min-h-[44px] flex items-center text-[11px] font-medium text-[var(--edk-red)] hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <span className="font-extrabold text-[var(--edk-red)] text-[14px]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  GH₵{(l.unitPrice * l.qty).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer (optional)</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Payment</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPaymentMethod(opt)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    paymentMethod === opt ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {opt.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Discount %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div>
              {discountPct > 0 && (
                <p className="text-sm text-slate-500">
                  −GH₵{discountAmt.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="text-lg font-bold text-slate-900">
                Total: GH₵{total.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCharge}
              disabled={charging || lines.length === 0 || !warehouseId}
              className="min-h-[44px] w-full rounded-[var(--edk-radius-sm)] bg-[var(--edk-red)] hover:bg-[var(--edk-red-hover)] px-6 py-3 font-bold text-white disabled:opacity-50 touch-manipulation"
            >
              {charging ? '…' : `Charge GH₵${total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
