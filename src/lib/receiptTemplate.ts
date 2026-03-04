/**
 * World-class POS receipt template — single source of truth for print (thermal) and full-page (download/PDF).
 * Ghana: GH₵, Africa/Accra. Clear hierarchy: brand → receipt # & date → cashier → items → totals → payment → footer.
 */

import { BRAND } from '../config/branding';

const GHANA_TZ = 'Africa/Accra';
const BUSINESS_NAME = BRAND.receiptTitle;
const STORE_TAGLINE = 'Your trusted kids fashion store';
const STORE_ADDRESS = 'Accra, Ghana';
const STORE_PHONE = '+233 XX XXX XXXX';

export interface ReceiptLine {
  name: string;
  sizeLabel?: string | null;
  qty: number;
  unitPrice: number;
}

export interface ReceiptPayload {
  receiptId?: string | null;
  completedAt?: string | null;
  lines: ReceiptLine[];
  subtotal?: number;
  discountPct?: number;
  discountAmt?: number;
  total: number;
  paymentMethod: string;
  /** When paymentMethod === 'mixed', breakdown for receipt. */
  payments?: Array<{ method: string; amount: number }>;
  customerName?: string | null;
  /** Cashier / sold_by email for audit trail */
  soldBy?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format date/time for Ghana receipt (Africa/Accra). */
export function formatReceiptDateTime(isoOrNull?: string | null): string {
  const d = isoOrNull ? new Date(isoOrNull) : new Date();
  return d.toLocaleString('en-GH', {
    timeZone: GHANA_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  });
}

/** Alias for formatReceiptDateTime for backward compatibility (e.g. printReceipt, share text). */
export const formatReceiptDate = formatReceiptDateTime;

export function formatReceiptDateOnly(isoOrNull?: string | null): string {
  const d = isoOrNull ? new Date(isoOrNull) : new Date();
  return d.toLocaleDateString('en-GH', {
    timeZone: GHANA_TZ,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatReceiptTimeOnly(isoOrNull?: string | null): string {
  const d = isoOrNull ? new Date(isoOrNull) : new Date();
  return d.toLocaleTimeString('en-GH', {
    timeZone: GHANA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  Cash: 'Cash',
  card: 'Card',
  Card: 'Card',
  mobile_money: 'Mobile Money',
  MoMo: 'Mobile Money',
  mixed: 'Mixed',
};

function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? (method || 'Payment');
}

/** Build receipt HTML. format: 'thermal' (80mm) or 'a5' (full page for download/print). */
export function buildReceiptHtml(
  payload: ReceiptPayload,
  options: { format: 'thermal' | 'a5'; title?: string }
): string {
  const { format, title = 'Receipt' } = options;
  const receiptNo = (payload.receiptId ?? '').trim() || '—';
  const dateStr = formatReceiptDateTime(payload.completedAt);
  const dateOnly = formatReceiptDateOnly(payload.completedAt);
  const timeOnly = formatReceiptTimeOnly(payload.completedAt);
  const isLocalOnly = (payload.receiptId ?? '').startsWith('LOCAL-');
  const subtotal = payload.subtotal ?? payload.total;
  const discountAmt = payload.discountAmt ?? 0;
  const hasDiscount = (payload.discountPct ?? 0) > 0 || discountAmt > 0;
  const payLabel = paymentLabel(payload.paymentMethod);
  const mixedPayments = payload.paymentMethod?.toLowerCase() === 'mixed' && (payload.payments?.length ?? 0) > 0
    ? payload.payments!
    : null;
  const paymentLinesHtml = mixedPayments
    ? mixedPayments
        .map((p) => `<p class="meta">${escapeHtml(paymentLabel(p.method))}: ${formatMoney(p.amount)}</p>`)
        .join('')
    : '';

  const linesHtml = payload.lines
    .map(
      (l) =>
        `<tr><td class="item-name">${escapeHtml(l.name)}${l.sizeLabel ? ` <span class="size">(${escapeHtml(l.sizeLabel)})</span>` : ''}</td><td class="qty">${l.qty}</td><td class="unit">${formatMoney(l.unitPrice)}</td><td class="amt">${formatMoney(l.unitPrice * l.qty)}</td></tr>`
    )
    .join('');

  if (format === 'thermal') {
    return `<!DOCTYPE html>
<html lang="en-GH">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} ${escapeHtml(receiptNo)}</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { font-family: 'Courier New', Courier, monospace; font-size: 12px; padding: 8px; max-width: 72mm; margin: 0 auto; color: #000; }
    .r { width: 100%; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .div { border-bottom: 1px dashed #333; margin: 6px 0; }
    h1 { font-size: 14px; margin: 0 0 4px 0; letter-spacing: 0.02em; }
    .meta { font-size: 10px; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; padding: 2px 0; border-bottom: 1px solid #333; }
    th.qty, th.unit, th.amt { text-align: right; }
    td { padding: 2px 0; }
    td.qty, td.unit, td.amt { text-align: right; }
    .item-name { word-break: break-word; max-width: 55%; }
    .totals { margin-top: 6px; font-size: 11px; }
    .totals .row { display: flex; justify-content: space-between; padding: 1px 0; }
    .total-row { font-weight: bold; font-size: 13px; margin-top: 4px; padding-top: 4px; border-top: 2px solid #000; }
    .footer { margin-top: 10px; text-align: center; font-size: 10px; }
    .warn { margin-top: 6px; font-size: 10px; color: #b45309; font-weight: bold; text-align: center; }
  </style>
</head>
<body>
  <div class="r">
    <h1 class="center bold">${escapeHtml(BUSINESS_NAME)}</h1>
    <p class="center meta">${escapeHtml(STORE_TAGLINE)}</p>
    <p class="center meta">${escapeHtml(STORE_ADDRESS)} · ${escapeHtml(STORE_PHONE)}</p>
    <div class="div"></div>
    <p class="center meta"><strong>Receipt No:</strong> ${escapeHtml(receiptNo)}</p>
    <p class="center meta">${escapeHtml(dateStr)}</p>
    <p class="center meta">${escapeHtml(GHANA_TZ)} (GMT)</p>
    ${payload.soldBy ? `<p class="center meta">Sold by: ${escapeHtml(payload.soldBy)}</p>` : ''}
    <div class="div"></div>
    <table>
      <thead><tr><th class="item-name">Item</th><th class="qty">Qty</th><th class="unit">Unit</th><th class="amt">Amount</th></tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="div"></div>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      ${hasDiscount ? `<div class="row"><span>Discount</span><span>−${formatMoney(discountAmt)}</span></div>` : ''}
      <div class="row total-row"><span>TOTAL</span><span>${formatMoney(payload.total)}</span></div>
    </div>
    <p class="meta">Payment: ${escapeHtml(payLabel)}</p>
    ${paymentLinesHtml}
    ${payload.customerName ? `<p class="meta">Customer: ${escapeHtml(payload.customerName)}</p>` : ''}
    ${isLocalOnly ? '<p class="warn">⚠ Not synced — reprint after sync</p>' : ''}
    <div class="div"></div>
    <p class="footer">Thank you for your purchase</p>
    <p class="footer">GH₵ — Ghana Cedi</p>
  </div>
</body>
</html>`;
  }

  // ── A5 / full-page: world-class layout for download and browser print ───
  return `<!DOCTYPE html>
<html lang="en-GH">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — ${escapeHtml(BUSINESS_NAME)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: #f4f4f5;
      min-height: 100vh;
      padding: 24px 16px 48px;
      color: #09090b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print { body { background: #fff; padding: 0; } }
    .receipt {
      background: #fff;
      max-width: 420px;
      margin: 0 auto;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 12px 40px rgba(0,0,0,.08);
      overflow: hidden;
    }
    @media print { .receipt { box-shadow: none; max-width: 100%; } }
    .header {
      padding: 24px 24px 20px;
      border-bottom: 1px solid #f4f4f5;
    }
    .brand { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #09090b; margin-bottom: 2px; }
    .tagline { font-size: 11px; color: #71717a; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; }
    .store-info { font-size: 11px; color: #a1a1aa; margin-top: 6px; }
    .meta-row {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .meta-block .label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #a1a1aa; margin-bottom: 4px; }
    .meta-block .value { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 600; color: #09090b; }
    .meta-block .value.date { font-family: inherit; }
    .meta-block .value.time { font-size: 11px; color: #71717a; margin-top: 2px; }
    .customer-bar {
      padding: 10px 24px;
      background: #fafafa;
      border-bottom: 1px solid #f4f4f5;
      font-size: 12px; color: #52525b;
      display: flex; align-items: center; gap: 8px;
    }
    .customer-bar .label { font-weight: 500; color: #a1a1aa; }
    .items-wrap { padding: 0 24px; }
    .table-head {
      display: grid;
      grid-template-columns: 1fr 40px 72px 80px;
      gap: 8px;
      padding: 14px 0 10px;
      border-bottom: 2px solid #09090b;
    }
    .col-head { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #71717a; }
    .col-head.right { text-align: right; }
    table.items { width: 100%; border-collapse: collapse; }
    .item-row td { padding: 10px 0 2px; vertical-align: top; }
    .item-row + .item-row td { border-top: 1px solid #f4f4f5; }
    .item-name { font-size: 13px; font-weight: 600; color: #09090b; line-height: 1.35; }
    .item-name .size { font-size: 11px; font-weight: 500; color: #71717a; background: #f4f4f5; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
    .item-qty, .item-price { font-size: 12px; color: #71717a; text-align: right; padding-top: 10px; }
    .item-amt { font-size: 13px; font-weight: 600; color: #09090b; text-align: right; padding-top: 10px; white-space: nowrap; }
    .summary { padding: 8px 24px 4px; border-top: 2px solid #09090b; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .summary-row .l { color: #71717a; font-weight: 500; }
    .summary-row .r { font-weight: 600; color: #09090b; }
    .summary-row.discount .r { color: #16a34a; }
    .total-bar {
      padding: 14px 24px 16px;
      border-top: 2px solid #09090b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .total-bar .label { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #09090b; }
    .total-bar .items { font-size: 11px; color: #a1a1aa; margin-top: 2px; }
    .total-bar .amount { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: #09090b; }
    .payment-bar {
      padding: 12px 24px 14px;
      background: #fafafa;
      border-top: 1px solid #f4f4f5;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .payment-bar .label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #a1a1aa; }
    .payment-bar .value { font-size: 13px; font-weight: 600; background: #09090b; color: #fff; padding: 6px 14px; border-radius: 999px; }
    .footer {
      padding: 16px 24px 20px;
      border-top: 1px solid #f4f4f5;
      text-align: center;
    }
    .footer-msg { font-size: 12px; color: #71717a; font-weight: 500; margin-bottom: 6px; }
    .footer-id { font-family: 'DM Mono', monospace; font-size: 10px; color: #d4d4d8; letter-spacing: 0.1em; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="brand">${escapeHtml(BUSINESS_NAME)}</div>
      <div class="tagline">${escapeHtml(STORE_TAGLINE)}</div>
      <div class="store-info">${escapeHtml(STORE_ADDRESS)} · ${escapeHtml(STORE_PHONE)}</div>
      <div class="meta-row">
        <div class="meta-block">
          <div class="label">Receipt No.</div>
          <div class="value">${escapeHtml(receiptNo)}</div>
        </div>
        <div class="meta-block" style="text-align: right;">
          <div class="label">Date & time</div>
          <div class="value date">${escapeHtml(dateOnly)}</div>
          <div class="value time">${escapeHtml(timeOnly)} · ${escapeHtml(GHANA_TZ)}</div>
          ${payload.soldBy ? `<div class="value time" style="margin-top: 4px;">Sold by: ${escapeHtml(payload.soldBy)}</div>` : ''}
        </div>
      </div>
    </div>
    ${payload.customerName ? `<div class="customer-bar"><span class="label">Customer</span><span>${escapeHtml(payload.customerName)}</span></div>` : ''}
    <div class="items-wrap">
      <div class="table-head">
        <span class="col-head">Item</span>
        <span class="col-head right">Qty</span>
        <span class="col-head right">Price</span>
        <span class="col-head right">Amount</span>
      </div>
      <table class="items">
        <tbody>${payload.lines.map((l) => `<tr class="item-row"><td class="item-name">${escapeHtml(l.name)}${l.sizeLabel ? ` <span class="size">${escapeHtml(l.sizeLabel)}</span>` : ''}</td><td class="item-qty">${l.qty}</td><td class="item-price">${formatMoney(l.unitPrice)}</td><td class="item-amt">${formatMoney(l.unitPrice * l.qty)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${subtotal !== payload.total || hasDiscount ? `
    <div class="summary">
      ${subtotal !== payload.total ? `<div class="summary-row"><span class="l">Subtotal</span><span class="r">${formatMoney(subtotal)}</span></div>` : ''}
      ${hasDiscount ? `<div class="summary-row discount"><span class="l">Discount</span><span class="r">−${formatMoney(discountAmt)}</span></div>` : ''}
    </div>` : ''}
    <div class="total-bar">
      <div>
        <div class="label">Total</div>
        <div class="items">${payload.lines.reduce((s, l) => s + l.qty, 0)} item(s)</div>
      </div>
      <div class="amount">${formatMoney(payload.total)}</div>
    </div>
    <div class="payment-bar">
      <span class="label">Payment</span>
      <span class="value">${escapeHtml(payLabel)}</span>
    </div>
    ${mixedPayments ? `<div class="payment-breakdown" style="margin-top: 6px; padding-left: 12px; font-size: 0.9em; color: #374151;">${mixedPayments.map((p) => `${escapeHtml(paymentLabel(p.method))}: ${formatMoney(p.amount)}`).join(' · ')}</div>` : ''}
    <div class="footer">
      <div class="footer-msg">Thank you for shopping with us</div>
      <div class="footer-id">${escapeHtml(receiptNo)} · GH₵ Ghana Cedi</div>
    </div>
  </div>
</body>
</html>`;
}
