// ============================================================
// SaleSuccessScreen.tsx
// File: warehouse-pos/src/components/pos/SaleSuccessScreen.tsx
//
// World-class post-sale experience.
// - Dark luxury backdrop with animated success state
// - Full thermal receipt with REAL receipt number from server
// - Product image thumbnails in line items
// - Download receipt as printable PDF page
// - Share via WhatsApp / native share sheet
// - Smooth slide-up animation
// ============================================================

import { useEffect, useState, useRef } from 'react';
import { type SalePayload } from './CartSheet';
import { safeProductImageUrl } from '../../lib/imageUpload';
import { buildReceiptHtml } from '../../lib/receiptTemplate';

// ── Extended sale type (POSPage sets receiptId from server) ────────────────
export interface CompletedSale extends SalePayload {
  receiptId?: string;
  saleId?: string;
  completedAt?: string;
}

/** Line item with optional key for list rendering and imageUrl for thumbnail */
export type CompletedSaleLine = CompletedSale['lines'][number] & { key?: string };

interface SaleSuccessScreenProps {
  sale: CompletedSale | null;
  onNewSale: () => void;
  onShareReceipt: (sale: CompletedSale) => void;
  onPrint: (sale: CompletedSale) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconPrint = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const IconWhatsApp = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

const IconDownload = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconPlus = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// ── Payment config (normalize API values to display) ────────────────────────

const PAYMENT_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  cash: { icon: '💵', label: 'Cash', color: 'bg-emerald-500' },
  Cash: { icon: '💵', label: 'Cash', color: 'bg-emerald-500' },
  mobile_money: { icon: '📱', label: 'Mobile Money', color: 'bg-amber-500' },
  MoMo: { icon: '📱', label: 'Mobile Money', color: 'bg-amber-500' },
  card: { icon: '💳', label: 'Card', color: 'bg-blue-500' },
  Card: { icon: '💳', label: 'Card', color: 'bg-blue-500' },
  mixed: { icon: '💰', label: 'Mixed', color: 'bg-slate-600' },
};

function getPaymentConfig(method: string): { icon: string; label: string; color: string } {
  return (
    PAYMENT_LABELS[method] ?? {
      icon: '💰',
      label: method || 'Payment',
      color: 'bg-slate-600',
    }
  );
}

// ── Download receipt as printable page (world-class shared template) ─────────

function downloadReceipt(sale: CompletedSale): void {
  const receiptNo = sale.receiptId ?? `RCPT-${Date.now().toString(36).toUpperCase()}`;
  const html = buildReceiptHtml(
    {
      receiptId: sale.receiptId ?? receiptNo,
      completedAt: sale.completedAt ?? null,
      lines: sale.lines.map((l) => ({
        name: l.name,
        sizeLabel: l.sizeLabel ?? null,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
      subtotal: sale.subtotal,
      discountPct: sale.discountPct,
      discountAmt: sale.discountAmt,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      customerName: sale.customerName ?? null,
      soldBy: (sale as { soldBy?: string | null }).soldBy ?? null,
    },
    { format: 'a5', title: 'Receipt' }
  );

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const tab = window.open(url, '_blank');
  if (!tab) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${receiptNo}.html`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ── Line item row ──────────────────────────────────────────────────────────

function ReceiptLine({ line }: { line: CompletedSaleLine }) {
  const [imgError, setImgError] = useState(false);
  const hasImg = line.imageUrl && !imgError;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      {hasImg ? (
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 border border-slate-200">
          <img
            src={safeProductImageUrl(line.imageUrl!)}
            alt={line.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-300 border border-slate-200">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-slate-900 truncate">{line.name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {line.sizeLabel ? `${line.sizeLabel} · ` : ''}
          {line.qty} × {fmt(line.unitPrice)}
        </p>
      </div>

      <p className="text-[14px] font-extrabold text-slate-900 tabular-nums flex-shrink-0">
        {fmt(line.unitPrice * line.qty)}
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SaleSuccessScreen({
  sale,
  onNewSale,
  onShareReceipt,
  onPrint,
}: SaleSuccessScreenProps) {
  const isOpen = sale !== null;
  const [visible, setVisible] = useState(false);
  const [badgeIn, setBadgeIn] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const t1 = setTimeout(() => setVisible(true), 20);
      const t2 = setTimeout(() => setBadgeIn(true), 100);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else {
      setVisible(false);
      setBadgeIn(false);
    }
  }, [isOpen]);

  if (!sale) return null;

  const payment = getPaymentConfig(sale.paymentMethod);
  const receiptNo = sale.receiptId ?? `RCPT-${Date.now().toString(36).toUpperCase()}`;
  const itemCount = sale.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div
      className={`
        fixed inset-0 z-[60] flex flex-col
        bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800
        transition-all duration-400
        ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}
      style={{ transitionDuration: '300ms' }}
    >
      {/* ── Top: Success state ── */}
      <div
        className={`
          flex flex-col items-center pt-12 pb-8 px-6
          transition-all duration-500
          ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
        `}
        style={{ transitionDelay: '80ms' }}
      >
        <div
          className={`
            w-[72px] h-[72px] rounded-full bg-emerald-500
            flex items-center justify-center mb-5
            shadow-[0_0_0_12px_rgba(16,185,129,0.15),0_8px_32px_rgba(16,185,129,0.35)]
            transition-all duration-600 ease-[cubic-bezier(0.34,1.56,0.64,1)]
            ${badgeIn ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}
          `}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <p className="text-[13px] font-semibold text-emerald-400 uppercase tracking-widest mb-1">
          Sale Complete
        </p>
        <p className="text-[38px] font-black text-white tabular-nums leading-none mb-3">
          {fmt(sale.total)}
        </p>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span
            className={`
            inline-flex items-center gap-1.5 h-7 px-3 rounded-full
            ${payment.color} text-white text-[12px] font-bold
          `}
          >
            {payment.icon} {payment.label}
          </span>

          <span className="inline-flex items-center h-7 px-3 rounded-full bg-slate-700 text-slate-300 text-[12px] font-semibold">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>

          {sale.customerName && (
            <span className="inline-flex items-center h-7 px-3 rounded-full bg-slate-700 text-slate-300 text-[12px] font-semibold">
              👤 {sale.customerName}
            </span>
          )}

          <span className="text-[12px] text-slate-500 font-medium">
            {fmtTime(sale.completedAt)}
          </span>
        </div>
      </div>

      {/* ── Receipt card ── */}
      <div
        className={`
          flex-1 overflow-y-auto px-4 pb-3
          transition-all duration-500
          ${visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}
        `}
        style={{ transitionDelay: '160ms' }}
      >
        <div
          ref={receiptRef}
          className="bg-white rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.35)]"
        >
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-[15px] font-black text-slate-900 tracking-tight">
                  Extreme Dept Kidz
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Official Receipt</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-mono font-bold text-slate-700">{receiptNo}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {fmtDateTime(sale.completedAt)}
                </p>
              </div>
            </div>
            <div className="mt-3 border-t border-dashed border-slate-200" />
          </div>

          <div className="px-5 py-1">
            {sale.lines.map((line, i) => (
              <ReceiptLine
                key={(line as CompletedSaleLine).key ?? `line-${i}-${line.productId}-${line.sizeCode ?? 'na'}`}
                line={line as CompletedSaleLine}
              />
            ))}
          </div>

          <div className="px-5 pb-5 pt-3 border-t border-dashed border-slate-200 space-y-2">
            {sale.subtotal !== sale.total && (
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-semibold text-slate-600 tabular-nums">
                  {fmt(sale.subtotal)}
                </span>
              </div>
            )}

            {(sale.discountPct ?? 0) > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-500">Discount ({sale.discountPct}%)</span>
                <span className="font-semibold text-emerald-600 tabular-nums">
                  −{fmt(sale.discountAmt ?? 0)}
                </span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
              <span className="text-[15px] font-black text-slate-900">Total</span>
              <span className="text-[22px] font-black text-slate-900 tabular-nums">
                {fmt(sale.total)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-100">
              <span className="text-[12px] text-slate-400">Payment method</span>
              <span
                className={`
                inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold text-white
                ${payment.color}
              `}
              >
                {payment.icon} {payment.label}
              </span>
            </div>
          </div>

          <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 font-medium">
              Thank you for shopping with us! 🙏
            </p>
            <p className="text-[10px] text-slate-300 mt-0.5 font-mono">{receiptNo}</p>
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div
        className={`
          px-4 pt-3 pb-8 flex flex-col gap-2.5 flex-shrink-0
          transition-all duration-500
          ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
        `}
        style={{ transitionDelay: '240ms' }}
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPrint(sale)}
            className="
              flex-1 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5
              bg-slate-800 border border-slate-700 text-white
              hover:bg-slate-700 active:scale-[0.97]
              transition-all duration-150
            "
          >
            <IconPrint />
            <span className="text-[10px] font-bold tracking-wide">PRINT</span>
          </button>

          <button
            type="button"
            onClick={() => downloadReceipt(sale)}
            className="
              flex-1 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5
              bg-slate-800 border border-slate-700 text-white
              hover:bg-slate-700 active:scale-[0.97]
              transition-all duration-150
            "
          >
            <IconDownload />
            <span className="text-[10px] font-bold tracking-wide">SAVE</span>
          </button>

          <button
            type="button"
            onClick={() => onShareReceipt(sale)}
            className="
              flex-1 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5
              bg-[#25D366] text-white
              hover:bg-[#1da851] active:scale-[0.97]
              transition-all duration-150
            "
          >
            <IconWhatsApp />
            <span className="text-[10px] font-bold tracking-wide">SHARE</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onNewSale}
          className="
            w-full h-14 rounded-2xl
            bg-red-500 hover:bg-red-600
            text-white text-[16px] font-extrabold
            flex items-center justify-center gap-2.5
            shadow-[0_4px_20px_rgba(239,68,68,0.35)]
            active:scale-[0.98]
            transition-all duration-150
          "
        >
          <IconPlus />
          New Sale
        </button>
      </div>

      <style>{`
        @keyframes successPop {
          0%   { transform: scale(0.4); opacity: 0; }
          70%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
