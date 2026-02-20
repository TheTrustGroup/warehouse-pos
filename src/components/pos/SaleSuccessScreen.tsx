// ============================================================
// SaleSuccessScreen.tsx
// File: warehouse-pos/src/components/pos/SaleSuccessScreen.tsx
//
// Full-screen overlay shown after a sale is completed.
// Shows: amount, payment method, customer name, line items.
// Actions: Share receipt, New sale.
// ============================================================

import { useEffect, useState } from 'react';
import { type SalePayload } from './CartSheet';

// ── Types ──────────────────────────────────────────────────────────────────

interface SaleSuccessScreenProps {
  sale: SalePayload | null;       // null = hidden
  onNewSale: () => void;
  onShareReceipt: (sale: SalePayload) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTime(): string {
  return new Date().toLocaleTimeString('en-GH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconShare = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
);

const IconPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// ── Payment method display ─────────────────────────────────────────────────

const PAYMENT_ICONS: Record<string, string> = {
  Cash: '💵',
  MoMo: '📱',
  Card: '💳',
};

// ── Receipt line ───────────────────────────────────────────────────────────

function ReceiptLine({ name, size, qty, unitPrice }: {
  name: string;
  size: string | null;
  qty: number;
  unitPrice: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5
      border-b border-dashed border-slate-200 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 truncate">{name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {size ? `${size} · ` : ''}{qty} × {formatPrice(unitPrice)}
        </p>
      </div>
      <p className="text-[13px] font-bold text-slate-900 tabular-nums flex-shrink-0">
        {formatPrice(unitPrice * qty)}
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SaleSuccessScreen({
  sale,
  onNewSale,
  onShareReceipt,
}: SaleSuccessScreenProps) {

  const isOpen = sale !== null;
  const [saleTime] = useState(formatTime());
  const [animateBadge, setAnimateBadge] = useState(false);

  // Trigger badge pop animation when opened
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setAnimateBadge(true), 50);
      return () => clearTimeout(t);
    } else {
      setAnimateBadge(false);
    }
  }, [isOpen]);

  if (!sale) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`
      fixed inset-0 z-50
      bg-slate-900
      flex flex-col
      transition-opacity duration-300
      ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
    `}>

      {/* Top section — success indicator */}
      <div className="flex flex-col items-center pt-16 pb-8 px-6">

        {/* Animated check circle */}
        <div className={`
          w-20 h-20 rounded-full bg-emerald-500
          flex items-center justify-center
          mb-5
          shadow-[0_8px_32px_rgba(16,185,129,0.4)]
          transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${animateBadge ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}
        `}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h2 className="text-[28px] font-extrabold text-white mb-1">
          Sale complete
        </h2>

        {/* Amount */}
        <p className="text-[32px] font-extrabold text-emerald-400 tabular-nums mb-2">
          {formatPrice(sale.total)}
        </p>

        {/* Payment + time row */}
        <div className="flex items-center gap-3">
          <span className="
            flex items-center gap-1.5
            h-7 px-3 rounded-full
            bg-slate-800 border border-slate-700
            text-[12px] font-semibold text-slate-300
          ">
            {PAYMENT_ICONS[sale.paymentMethod] ?? '💰'} {sale.paymentMethod}
          </span>

          {sale.customerName && (
            <span className="
              h-7 px-3 rounded-full
              bg-slate-800 border border-slate-700
              text-[12px] font-semibold text-slate-300
            ">
              {sale.customerName}
            </span>
          )}

          <span className="text-[12px] text-slate-600 font-medium">
            {saleTime}
          </span>
        </div>
      </div>

      {/* Receipt card */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="
          bg-white rounded-2xl
          shadow-[0_4px_24px_rgba(0,0,0,0.15)]
          overflow-hidden
        ">
          {/* Receipt header */}
          <div className="
            px-5 py-4 border-b border-dashed border-slate-200
            flex items-center justify-between
          ">
            <div>
              <p className="text-[13px] font-bold text-slate-900">Extreme Dept Kidz</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{sale.customerName || 'Walk-in customer'}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">{saleTime}</p>
              <p className="text-[11px] font-mono text-slate-300 mt-0.5">
                #{Math.random().toString(36).slice(2, 8).toUpperCase()}
              </p>
            </div>
          </div>

          {/* Line items */}
          <div className="px-5 py-2">
            {sale.lines.map(line => (
              <ReceiptLine
                key={line.key}
                name={line.name}
                size={line.sizeLabel}
                qty={line.qty}
                unitPrice={line.unitPrice}
              />
            ))}
          </div>

          {/* Totals */}
          <div className="px-5 py-4 border-t border-dashed border-slate-200 space-y-2">
            <div className="flex justify-between text-[13px]">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-semibold text-slate-700 tabular-nums">
                {formatPrice(sale.subtotal)}
              </span>
            </div>

            {sale.discountPct > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-500">Discount ({sale.discountPct}%)</span>
                <span className="font-semibold text-emerald-600 tabular-nums">
                  −{formatPrice(sale.discountAmt)}
                </span>
              </div>
            )}

            <div className="
              flex justify-between items-center
              pt-3 border-t border-slate-200
            ">
              <span className="text-[15px] font-bold text-slate-900">Total</span>
              <span className="text-[18px] font-extrabold text-slate-900 tabular-nums">
                {formatPrice(sale.total)}
              </span>
            </div>

            {/* Payment method row */}
            <div className="
              flex items-center justify-between
              mt-2 pt-3 border-t border-dashed border-slate-200
            ">
              <span className="text-[12px] text-slate-400">Paid via</span>
              <span className="text-[12px] font-semibold text-slate-600">
                {PAYMENT_ICONS[sale.paymentMethod]} {sale.paymentMethod}
              </span>
            </div>
          </div>

          {/* Receipt footer */}
          <div className="
            px-5 py-4 bg-slate-50
            border-t border-dashed border-slate-200
            text-center
          ">
            <p className="text-[11px] text-slate-400 font-medium">
              Thank you for shopping with us!
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-8 pt-4 flex flex-col gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => onShareReceipt(sale)}
          className="
            w-full h-[52px] rounded-2xl
            bg-slate-800 border border-slate-700
            text-white text-[15px] font-bold
            flex items-center justify-center gap-2.5
            hover:bg-slate-700
            active:scale-[0.98]
            transition-all duration-150
          "
        >
          <IconShare />
          Share receipt
        </button>

        <button
          type="button"
          onClick={onNewSale}
          className="
            w-full h-14 rounded-2xl border-none
            bg-red-500 hover:bg-red-600
            text-white text-[16px] font-extrabold
            flex items-center justify-center gap-2.5
            shadow-[0_4px_16px_rgba(239,68,68,0.3)]
            active:scale-[0.98]
            transition-all duration-150
          "
        >
          <IconPlus />
          New sale
        </button>
      </div>
    </div>
  );
}
