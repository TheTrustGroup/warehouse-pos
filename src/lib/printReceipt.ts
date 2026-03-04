/**
 * POS receipt printing — Ghana standard.
 * Uses shared world-class template (receiptTemplate.buildReceiptHtml) in thermal format.
 * In-window hidden iframe so print is not blocked by the browser.
 * Date/time in Africa/Accra; currency GH₵.
 */

import { buildReceiptHtml } from './receiptTemplate';
import type { ReceiptPayload } from './receiptTemplate';

export interface PrintReceiptPayload {
  receiptId?: string;
  warehouseId?: string;
  lines: Array<{ name: string; sizeLabel?: string | null; qty: number; unitPrice: number }>;
  subtotal?: number;
  discountPct?: number;
  discountAmt?: number;
  total: number;
  paymentMethod: string;
  /** When paymentMethod === 'mixed', breakdown for receipt. */
  payments?: Array<{ method: string; amount: number }>;
  customerName?: string | null;
  completedAt?: string | null;
  /** Cashier email for audit (optional). */
  soldBy?: string | null;
}

/** Format date/time for Ghana receipt. Re-exported for share/serialisation. */
export { formatReceiptDate } from './receiptTemplate';

export function printReceipt(sale: PrintReceiptPayload): void {
  const payload: ReceiptPayload = {
    receiptId: sale.receiptId,
    completedAt: sale.completedAt,
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
    payments: sale.payments ?? undefined,
    customerName: sale.customerName ?? null,
    soldBy: sale.soldBy ?? null,
  };
  const html = buildReceiptHtml(payload, { format: 'thermal', title: 'Receipt' });

  // In-window iframe: avoids pop-up blockers; no new window required.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Receipt print');
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    console.warn('[printReceipt] Could not get iframe document.');
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }

  const runPrint = () => {
    win.focus();
    win.print();
    const cleanup = () => {
      try {
        if (iframe.parentNode) document.body.removeChild(iframe);
      } catch {
        /* already removed */
      }
    };
    if (typeof win.onafterprint !== 'undefined') {
      win.onafterprint = cleanup;
    } else {
      setTimeout(cleanup, 500);
    }
  };

  if (doc.readyState === 'complete') {
    setTimeout(runPrint, 0);
  } else {
    win.onload = runPrint;
  }
}
