/**
 * Receipt printing: opens a print-friendly window with receipt content.
 * Uses window.print() so the user can choose system printer or "Save as PDF".
 */

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
  completedAt?: string | null;
}

function formatMoney(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function printReceipt(sale: PrintReceiptPayload): void {
  const linesHtml = sale.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}${l.sizeLabel ? ` (${escapeHtml(l.sizeLabel)})` : ''}</td><td align="right">${l.qty}</td><td align="right">${formatMoney(l.unitPrice * l.qty)}</td></tr>`
    )
    .join('');

  const discountLine =
    (sale.discountPct ?? 0) > 0
      ? `<tr><td colspan="2">Discount</td><td align="right">−${formatMoney(sale.discountAmt ?? 0)}</td></tr>`
      : '';

  const dateStr = sale.completedAt
    ? new Date(sale.completedAt).toLocaleString('en-GH')
    : new Date().toLocaleString('en-GH');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt ${escapeHtml(sale.receiptId ?? '')}</title>
  <style>
    body { font-family: system-ui, sans-serif; font-size: 14px; padding: 16px; max-width: 320px; margin: 0 auto; }
    h1 { font-size: 18px; margin: 0 0 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { text-align: left; border-bottom: 1px solid #ccc; padding: 4px 0; }
    td { padding: 4px 0; }
    .total { font-weight: bold; font-size: 16px; margin-top: 8px; }
    .meta { color: #666; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>Extreme Dept Kidz</h1>
  <p class="meta">${escapeHtml(sale.receiptId ?? '')}</p>
  <table>
    <thead><tr><th>Item</th><th align="right">Qty</th><th align="right">Amount</th></tr></thead>
    <tbody>${linesHtml}${discountLine}</tbody>
  </table>
  <p class="total">Total: ${formatMoney(sale.total)}</p>
  <p class="meta">Paid: ${escapeHtml(sale.paymentMethod)}</p>
  ${sale.customerName ? `<p class="meta">Customer: ${escapeHtml(sale.customerName)}</p>` : ''}
  <p class="meta">${dateStr}</p>
</body>
</html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    console.warn('[printReceipt] Pop-up blocked; user may need to allow pop-ups.');
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
