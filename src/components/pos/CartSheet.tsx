// ============================================================
// CartSheet.tsx
// File: warehouse-pos/src/components/pos/CartSheet.tsx
//
// Full cart experience in a bottom sheet.
// - Line items with qty controls + remove
// - Customer name capture
// - Cart-level discount %
// - Payment method selector (Cash, MoMo, Card)
// - Charge button
//
// Fully controlled. Parent owns cart state.
// ============================================================

import { useState, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CartLine {
  key: string;           // `${productId}__${sizeCode ?? 'NA'}`
  productId: string;
  name: string;
  sku: string;
  sizeCode: string | null;
  sizeLabel: string | null;
  unitPrice: number;
  qty: number;
}

export type PaymentMethod = 'Cash' | 'MoMo' | 'Card';

export interface SalePayload {
  lines: CartLine[];
  subtotal: number;
  discountPct: number;
  discountAmt: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerName: string;
  warehouseId: string;
}

interface CartSheetProps {
  isOpen: boolean;
  lines: CartLine[];
  warehouseId: string;
  onUpdateQty: (key: string, delta: number) => void;
  onRemoveLine: (key: string) => void;
  onClearCart: () => void;
  onCharge: (payload: SalePayload) => Promise<void>;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconSpinner = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ animation: 'cart-spin 0.8s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

// ── Payment Method Button ──────────────────────────────────────────────────

interface PayBtnProps {
  method: PaymentMethod;
  icon: string;
  selected: boolean;
  onSelect: () => void;
}

function PayBtn({ method, icon, selected, onSelect }: PayBtnProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        flex-1 h-14 rounded-2xl border-[1.5px]
        flex flex-col items-center justify-center gap-1
        font-sans text-[12px] font-bold
        transition-all duration-150 active:scale-95
        ${selected
          ? 'bg-slate-900 border-slate-900 text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]'
          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
        }
      `}
    >
      <span className="text-[18px] leading-none">{icon}</span>
      <span>{method}</span>
    </button>
  );
}

// ── Cart Line Item ─────────────────────────────────────────────────────────

interface CartLineItemProps {
  line: CartLine;
  onUpdateQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
}

function CartLineItem({ line, onUpdateQty, onRemove }: CartLineItemProps) {
  const lineTotal = line.unitPrice * line.qty;

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-b border-slate-50 last:border-0">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-slate-900 truncate leading-snug">
          {line.name}
        </p>
        <p className="text-[12px] text-slate-400 mt-0.5">
          {line.sizeLabel ? `${line.sizeLabel} · ` : ''}{formatPrice(line.unitPrice)} each
        </p>

        {/* Qty controls */}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => onUpdateQty(line.key, -1)}
            disabled={line.qty <= 1}
            className="
              w-7 h-7 rounded-lg border-[1.5px] border-slate-200 bg-white
              text-[14px] font-bold text-slate-600
              flex items-center justify-center
              hover:bg-slate-100 active:scale-90
              disabled:opacity-30 disabled:cursor-not-allowed
              transition-all duration-150
            "
          >
            −
          </button>
          <span className="text-[14px] font-bold text-slate-900 min-w-[20px] text-center tabular-nums">
            {line.qty}
          </span>
          <button
            type="button"
            onClick={() => onUpdateQty(line.key, 1)}
            className="
              w-7 h-7 rounded-lg border-[1.5px] border-slate-200 bg-white
              text-[14px] font-bold text-slate-600
              flex items-center justify-center
              hover:bg-slate-100 active:scale-90
              transition-all duration-150
            "
          >
            +
          </button>
        </div>
      </div>

      {/* Right side: total + remove */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0 pt-0.5">
        <button
          type="button"
          onClick={() => onRemove(line.key)}
          className="
            w-7 h-7 rounded-lg bg-red-50 text-red-400
            flex items-center justify-center
            hover:bg-red-100 hover:text-red-600
            active:scale-90 transition-all duration-150
          "
        >
          <IconX />
        </button>
        <p className="text-[14px] font-bold text-slate-900 tabular-nums">
          {formatPrice(lineTotal)}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

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

  const [customerName, setCustomerName] = useState('');
  const [discountPct, setDiscountPct] = useState<number | ''>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [isCharging, setIsCharging] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);

  // Reset discount + payment when cart opens fresh
  useEffect(() => {
    if (isOpen) {
      setDiscountPct(0);
      setPaymentMethod('Cash');
    }
  }, [isOpen]);

  // Trap body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isCharging) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isCharging, onClose]);

  // ── Derived totals ────────────────────────────────────────────────────────

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const disc = Number(discountPct) || 0;
  const discountAmt = subtotal * (disc / 100);
  const total = subtotal - discountAmt;
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  // ── Charge handler ────────────────────────────────────────────────────────

  async function handleCharge() {
    if (lines.length === 0 || isCharging) return;
    setIsCharging(true);
    try {
      await onCharge({
        lines,
        subtotal,
        discountPct: disc,
        discountAmt,
        total,
        paymentMethod,
        customerName: customerName.trim(),
        warehouseId,
      });
      // Reset local state on success
      setCustomerName('');
      setDiscountPct(0);
      setPaymentMethod('Cash');
    } finally {
      setIsCharging(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-40 transition-all duration-250
          ${isOpen
            ? 'bg-black/40 backdrop-blur-[2px] pointer-events-auto'
            : 'bg-transparent pointer-events-none'
          }
        `}
        onClick={() => !isCharging && onClose()}
      />

      {/* Sheet */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50
          bg-white rounded-t-[24px]
          shadow-[0_-8px_40px_rgba(0,0,0,0.12)]
          flex flex-col
          max-h-[92vh]
          transition-transform duration-300 ease-[cubic-bezier(0.34,1.1,0.64,1)]
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-[18px] font-bold text-slate-900">Cart</h2>
            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
              {itemCount} item{itemCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lines.length > 0 && (
              <button
                type="button"
                onClick={onClearCart}
                disabled={isCharging}
                className="
                  h-8 px-3 rounded-lg text-[12px] font-semibold text-red-500
                  bg-red-50 hover:bg-red-100
                  disabled:opacity-40
                  transition-colors duration-150
                "
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isCharging}
              className="
                w-9 h-9 rounded-xl border border-slate-200 bg-slate-50
                text-slate-400 flex items-center justify-center
                hover:bg-slate-100 hover:text-slate-600
                disabled:opacity-40
                transition-all duration-150
              "
            >
              <IconX />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* Empty state */}
          {lines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 text-slate-300">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
              </div>
              <p className="text-[15px] font-bold text-slate-700 mb-1">Cart is empty</p>
              <p className="text-[13px] text-slate-400">Tap a product to add it</p>
            </div>
          )}

          {/* Customer name */}
          {lines.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
              <span className="text-slate-400 flex-shrink-0"><IconUser /></span>
              <input
                ref={customerInputRef}
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="
                  flex-1 h-10 bg-transparent
                  font-sans text-[14px] text-slate-900
                  placeholder:text-slate-300
                  outline-none border-none
                "
              />
              {customerName && (
                <button
                  type="button"
                  onClick={() => setCustomerName('')}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <IconX />
                </button>
              )}
            </div>
          )}

          {/* Line items */}
          {lines.length > 0 && (
            <div>
              {lines.map(line => (
                <CartLineItem
                  key={line.key}
                  line={line}
                  onUpdateQty={onUpdateQty}
                  onRemove={onRemoveLine}
                />
              ))}
            </div>
          )}

          {/* Discount row */}
          {lines.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100">
              <div>
                <p className="text-[13px] font-semibold text-slate-700">Cart discount</p>
                {disc > 0 && (
                  <p className="text-[12px] text-emerald-600 font-medium mt-0.5">
                    Saving {formatPrice(discountAmt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={e => {
                    const v = e.target.value;
                    setDiscountPct(v === '' ? '' : Math.min(100, Math.max(0, Number(v))));
                  }}
                  className="
                    w-16 h-10 rounded-xl border-[1.5px] border-slate-200
                    bg-slate-50 text-center
                    font-sans text-[16px] font-bold text-slate-900
                    focus:outline-none focus:border-red-400 focus:bg-white
                    focus:ring-[3px] focus:ring-red-100
                    [appearance:textfield]
                    [&::-webkit-outer-spin-button]:appearance-none
                    [&::-webkit-inner-spin-button]:appearance-none
                    transition-all duration-150
                  "
                />
                <span className="text-[14px] font-semibold text-slate-400">%</span>
              </div>
            </div>
          )}

          {/* Totals */}
          {lines.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[13px] text-slate-500">Subtotal</span>
                <span className="text-[13px] font-semibold text-slate-700 tabular-nums">
                  {formatPrice(subtotal)}
                </span>
              </div>
              {disc > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-slate-500">Discount ({disc}%)</span>
                  <span className="text-[13px] font-semibold text-emerald-600 tabular-nums">
                    −{formatPrice(discountAmt)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-[16px] font-bold text-slate-900">Total</span>
                <span className="text-[20px] font-extrabold text-red-500 tabular-nums">
                  {formatPrice(total)}
                </span>
              </div>
            </div>
          )}

          {/* Payment methods */}
          {lines.length > 0 && (
            <>
              <div className="px-5 pt-2 pb-3 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Payment method
                </p>
                <div className="flex gap-2">
                  {([
                    { method: 'Cash', icon: '💵' },
                    { method: 'MoMo', icon: '📱' },
                    { method: 'Card', icon: '💳' },
                  ] as { method: PaymentMethod; icon: string }[]).map(({ method, icon }) => (
                    <PayBtn
                      key={method}
                      method={method}
                      icon={icon}
                      selected={paymentMethod === method}
                      onSelect={() => setPaymentMethod(method)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Bottom padding */}
          <div className="h-4" />
        </div>

        {/* Sticky charge button */}
        {lines.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={handleCharge}
              disabled={isCharging || lines.length === 0}
              className="
                w-full h-14 rounded-2xl border-none
                bg-emerald-500 hover:bg-emerald-600
                text-white text-[16px] font-extrabold
                flex items-center justify-center gap-2.5
                disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed
                active:scale-[0.98]
                transition-all duration-150
                shadow-[0_4px_16px_rgba(16,185,129,0.3)]
              "
            >
              {isCharging ? (
                <>
                  <IconSpinner />
                  Processing…
                </>
              ) : (
                `Charge ${formatPrice(total)}`
              )}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes cart-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
