/**
 * POS receipt printing — Ghana standard.
 * Opens a print-friendly window (80mm thermal style). Uses window.print() for system printer or Save as PDF.
 * Date/time shown in Ghana timezone (Africa/Accra). Currency: GH₵ (en-GH).
 * Receipt is saved server-side when POST /api/sales succeeds (receipt_id in sales table).
 */

const GHANA_TZ = 'Africa/Accra';
const BUSINESS_NAME = 'Extreme Dept Kidz';

export interface PrintReceiptPayload {
  receiptId?: string;
  warehouseId?: string;
  lines: Array<{ name: string; sizeLabel?: string | null; qty: number; unitPrice: number }>;
  subtotal?: number;
  discountPct?: number;
  discountAmt?: number;
  total: number;
  paymentMethod: string;
  customerName?: string | null;
  /** ISO timestamp from server (sales.created_at) or client when offline. Shown in Ghana time. */
  completedAt?: string | null;
}

function formatMoney(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format date/time for Ghana receipt (Africa/Accra). Exported for share/serialisation. */
export function formatReceiptDate(isoOrNull?: string | null): string {
  const d = isoOrNull ? new Date(isoOrNull) : new Date();
  return d.toLocaleString('en-GH', {
    timeZone: GHANA_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  });
}

function escapeHtml(s: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = s;
    return div.innerHTML;
  }
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printReceipt(sale: PrintReceiptPayload): void {
  const receiptNo = sale.receiptId?.trim() || '—';
  const dateStr = formatReceiptDate(sale.completedAt);
  const isLocalOnly = (sale.receiptId ?? '').startsWith('LOCAL-');

  const linesHtml = sale.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}${l.sizeLabel ? ` (${escapeHtml(l.sizeLabel)})` : ''}</td><td align="right">${l.qty}</td><td align="right">${formatMoney(l.unitPrice)}</td><td align="right">${formatMoney(l.unitPrice * l.qty)}</td></tr>`
    )
    .join('');

  const subtotal = sale.subtotal ?? sale.total;
  const discountAmt = sale.discountAmt ?? 0;
  const hasDiscount = (sale.discountPct ?? 0) > 0 || discountAmt > 0;

  const html = `
<!DOCTYPE html>
<html lang="en-GH">
<head>
  <meta charset="utf-8">
  <title>Receipt ${escapeHtml(receiptNo)}</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { font-family: 'Courier New', Courier, monospace; font-size: 12px; padding: 10px; max-width: 72mm; margin: 0 auto; color: #000; }
    .receipt { width: 100%; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #333; margin: 6px 0; }
    h1 { font-size: 14px; margin: 0 0 4px 0; letter-spacing: 0.02em; }
    .receipt-no { font-size: 11px; margin-bottom: 2px; }
    .date { font-size: 11px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; padding: 2px 0; border-bottom: 1px solid #333; }
    th.qty, th.unit, th.amt { text-align: right; }
    td { padding: 2px 0; vertical-align: top; }
    td.qty, td.unit, td.amt { text-align: right; }
    .item-name { word-break: break-word; max-width: 55%; }
    .totals { margin-top: 6px; font-size: 11px; }
    .totals .row { display: flex; justify-content: space-between; padding: 1px 0; }
    .total-row { font-weight: bold; font-size: 13px; margin-top: 4px; padding-top: 4px; border-top: 2px solid #000; }
    .meta { font-size: 10px; margin-top: 8px; color: #333; }
    .footer { margin-top: 12px; text-align: center; font-size: 10px; }
    .local-warn { margin-top: 6px; font-size: 10px; color: #b45309; font-weight: bold; }
  </style>
</head>
<body>
  <div class="receipt">
    <h1 class="center bold">${escapeHtml(BUSINESS_NAME)}</h1>
    <p class="center receipt-no">Receipt No: ${escapeHtml(receiptNo)}</p>
    <p class="center date">${escapeHtml(dateStr)}</p>
    <p class="center date">${escapeHtml(GHANA_TZ)} (GMT)</p>
    <div class="divider"></div>
    <table>
      <thead><tr><th class="item-name">Item</th><th class="qty">Qty</th><th class="unit">Unit</th><th class="amt">Amount</th></tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="divider"></div>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      ${hasDiscount ? `<div class="row"><span>Discount</span><span>−${formatMoney(discountAmt)}</span></div>` : ''}
      <div class="row total-row"><span>TOTAL</span><span>${formatMoney(sale.total)}</span></div>
    </div>
    <div class="meta">
      <p>Payment: ${escapeHtml(sale.paymentMethod)}</p>
      ${sale.customerName ? `<p>Customer: ${escapeHtml(sale.customerName)}</p>` : ''}
    </div>
    ${isLocalOnly ? '<p class="local-warn center">⚠ Not synced to server — reprint after sync</p>' : ''}
    <div class="divider"></div>
    <p class="footer">Thank you for your purchase</p>
    <p class="footer">GH₵ — Ghana Cedi</p>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    console.warn('[printReceipt] Pop-up blocked; allow pop-ups to print.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
    w.onafterprint = () => w.close();
  };
}
