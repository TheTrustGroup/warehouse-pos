import { useState, useEffect, useRef } from 'react';

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

/** Optional delivery schedule captured at checkout. When set, sale is recorded with delivery_status = 'pending'. */
export interface DeliverySchedule {
  expectedDate?: string | null;   // ISO date (YYYY-MM-DD) or null for ASAP
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
}

/** Single payment leg for mixed payments. */
export type PaymentMethodType = 'cash' | 'card' | 'mobile_money';

export interface SalePayload {
  warehouseId: string;
  customerName?: string | null;
  /** When set, receipt is emailed to this address after the sale. */
  customerEmail?: string | null;
  paymentMethod: string;
  /** When paymentMethod === 'mixed', required: amounts per method that sum to total. */
  payments?: Array<{ method: PaymentMethodType; amount: number }>;
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
  /** When present, sale is recorded as delivery (pending) with expected date/recipient. */
  deliverySchedule?: DeliverySchedule | null;
}

interface CartSheetProps {
  isOpen: boolean;
  lines: CartLine[];
  warehouseId: string;
  /** When false, charge is disabled and button shows "Loading...". Prevents sale with unloaded warehouse. */
  isWarehouseReady?: boolean;
  onUpdateQty: (key: string, delta: number) => void;
  onRemoveLine: (key: string) => void;
  onClearCart: () => void;
  onCharge: (payload: SalePayload) => void | Promise<void>;
  onClose: () => void;
}

const PAYMENT_OPTIONS = ['cash', 'card', 'mobile_money', 'mixed'] as const;

const MIX_LABELS: Record<PaymentMethodType, string> = {
  cash: 'Cash (GH₵)',
  card: 'Card (GH₵)',
  mobile_money: 'Mobile Money (GH₵)',
};

export default function CartSheet({
  isOpen,
  lines,
  warehouseId,
  isWarehouseReady = true,
  onUpdateQty,
  onRemoveLine,
  onClearCart,
  onCharge,
  onClose,
}: CartSheetProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  /** When paymentMethod === 'mixed', amount per method. Must sum to total to allow charge. */
  const [mixedAmounts, setMixedAmounts] = useState<Record<PaymentMethodType, string>>({
    cash: '',
    card: '',
    mobile_money: '',
  });
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [charging, setCharging] = useState(false);
  const [chargingLonger, setChargingLonger] = useState(false);
  useEffect(() => {
    if (!charging) {
      setChargingLonger(false);
      return;
    }
    const t = setTimeout(() => setChargingLonger(true), 10_000);
    return () => clearTimeout(t);
  }, [charging]);
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [deliveryAsap, setDeliveryAsap] = useState(true);
  const [expectedDate, setExpectedDate] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const lastChargeTapRef = useRef(0);

  if (!isOpen) return null;

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discountAmt = (subtotal * discountPct) / 100;
  const total = Math.max(0, subtotal - discountAmt);

  const mixedSum = (() => {
    const c = parseFloat(mixedAmounts.cash) || 0;
    const d = parseFloat(mixedAmounts.card) || 0;
    const m = parseFloat(mixedAmounts.mobile_money) || 0;
    return Math.round((c + d + m) * 100) / 100;
  })();
  const isMixedValid = paymentMethod !== 'mixed' || (mixedSum > 0 && Math.abs(mixedSum - total) < 0.01);
  const mixedPaymentsArray: Array<{ method: PaymentMethodType; amount: number }> =
    paymentMethod === 'mixed'
      ? ([
          { method: 'cash' as const, amount: parseFloat(mixedAmounts.cash) || 0 },
          { method: 'card' as const, amount: parseFloat(mixedAmounts.card) || 0 },
          { method: 'mobile_money' as const, amount: parseFloat(mixedAmounts.mobile_money) || 0 },
        ].filter((p) => p.amount > 0) as Array<{ method: PaymentMethodType; amount: number }>)
      : [];

  const handleCharge = async () => {
    const now = Date.now();
    if (now - lastChargeTapRef.current < 1000) return;
    lastChargeTapRef.current = now;
    if (!warehouseId || !isWarehouseReady || lines.length === 0 || charging) return;
    if (paymentMethod === 'mixed' && !isMixedValid) return;
    setCharging(true);
    try {
      const deliverySchedule: DeliverySchedule | null = deliveryRequested
        ? {
            expectedDate: deliveryAsap ? null : (expectedDate.trim() || null),
            recipientName: recipientName.trim() || null,
            recipientPhone: recipientPhone.trim() || null,
            deliveryAddress: deliveryAddress.trim() || null,
            deliveryNotes: deliveryNotes.trim() || null,
          }
        : null;

      await onCharge({
        warehouseId,
        customerName: customerName.trim() || null,
        customerEmail: customerEmail.trim() || null,
        paymentMethod,
        payments: paymentMethod === 'mixed' ? mixedPaymentsArray : undefined,
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
        deliverySchedule: deliverySchedule ?? undefined,
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
            <label className="block text-sm font-medium text-slate-700">Email receipt (optional)</label>
            <input
              type="email"
              inputMode="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          {/* Schedule for delivery — optional; when set, sale is recorded as delivery (pending). */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={deliveryRequested}
                onChange={(e) => setDeliveryRequested(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-700">Schedule for delivery</span>
            </label>
            {deliveryRequested && (
              <>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={deliveryAsap}
                    onChange={(e) => setDeliveryAsap(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-600">ASAP (no specific date)</span>
                </label>
                {!deliveryAsap && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Preferred date</label>
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-500">Recipient name</label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Full name"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Phone</label>
                  <input
                    type="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="e.g. 0244 XXX XXX"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Delivery address</label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Street, area, landmark"
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Notes (optional)</label>
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="Gate code, time window, etc."
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
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
            {paymentMethod === 'mixed' && (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-medium text-slate-600">Payment mix — amounts must equal total (GH₵{total.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</p>
                {(['cash', 'card', 'mobile_money'] as const).map((method) => (
                  <div key={method}>
                    <label className="block text-xs text-slate-500">{MIX_LABELS[method]}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      value={mixedAmounts[method]}
                      onChange={(e) =>
                        setMixedAmounts((prev) => ({ ...prev, [method]: e.target.value }))
                      }
                      placeholder="0.00"
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <p className={`text-xs font-medium ${isMixedValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Sum: GH₵{mixedSum.toLocaleString('en-GH', { minimumFractionDigits: 2 })} {isMixedValid ? '✓' : '(must equal total)'}
                </p>
              </div>
            )}
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
              disabled={charging || lines.length === 0 || !warehouseId || !isWarehouseReady || !isMixedValid}
              className="min-h-[44px] w-full rounded-[var(--edk-radius-sm)] bg-[var(--edk-red)] hover:bg-[var(--edk-red-hover)] px-6 py-3 font-bold text-white disabled:opacity-50 touch-manipulation"
            >
              {!isWarehouseReady ? 'Loading…' : charging ? '…' : `Charge GH₵${total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`}
            </button>
            {chargingLonger && (
              <p className="text-xs text-slate-500 mt-2 text-center" role="status" aria-live="polite">
                Taking longer than usual. Please keep the app open.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
