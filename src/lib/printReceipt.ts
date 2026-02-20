// ============================================================
// printReceipt.ts
// File: warehouse-pos/src/lib/printReceipt.ts
//
// Cross-platform receipt printing.
//
// How it works:
//   1. Builds a 58mm/80mm thermal receipt HTML document in memory
//   2. Injects it into a hidden <iframe>
//   3. Calls iframe.contentWindow.print()
//   4. Cleans up the iframe after the print dialog closes
//
// Why iframe instead of window.print()?
//   - window.print() prints the ENTIRE POS page
//   - An iframe isolates exactly the receipt content
//   - No need for complex CSS @media print rules on the main page
//   - Works on: Chrome desktop, Safari (iOS/macOS), Firefox, Edge
//
// Mobile (Android/iOS):
//   - Chrome for Android: opens system print dialog (supports PDF save)
//   - Safari iOS: opens AirPrint / PDF export sheet
//   - Falls back gracefully if print is unavailable
//
// Thermal printer compatibility:
//   - Width set to 58mm (standard thermal receipt width)
//   - Font: monospace fallback chain for thermal compatibility
//   - No images, no colors — pure black text
//   - Toggle RECEIPT_WIDTH to '80mm' for wider printers
// ============================================================

import { type SalePayload } from '../components/pos/CartSheet';

// ── Config ────────────────────────────────────────────────────────────────

const STORE_NAME    = 'Extreme Dept Kidz';
const STORE_ADDRESS = 'Ghana'; // update with real address
const STORE_PHONE   = '';      // e.g. '+233 XX XXX XXXX'
const RECEIPT_WIDTH = '80mm';  // '58mm' for small thermal, '80mm' for wide

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `GH${String.fromCharCode(0x20B5)}${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(): string {
  return new Date().toLocaleString('en-GH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function receiptId(): string {
  return '#' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Receipt HTML builder ──────────────────────────────────────────────────

function buildReceiptHTML(sale: SalePayload & { receiptId?: string }): string {
  const id   = sale.receiptId ?? receiptId();
  const date = fmtDate();

  const lineRows = sale.lines.map(l => {
    const label = l.sizeLabel ? `${l.name} (${l.sizeLabel})` : l.name;
    const qty   = `${l.qty}x ${fmt(l.unitPrice)}`;
    const total = fmt(l.unitPrice * l.qty);
    return `
      <tr>
        <td colspan="2" class="item-name">${esc(label)}</td>
      </tr>
      <tr>
        <td class="item-qty">${esc(qty)}</td>
        <td class="item-total">${esc(total)}</td>
      </tr>`;
  }).join('');

  const discountRow = sale.discountPct > 0 ? `
    <tr class="summary-row">
      <td>Discount (${sale.discountPct}%)</td>
      <td class="right">-${fmt(sale.discountAmt)}</td>
    </tr>` : '';

  const phoneRow = STORE_PHONE ? `<p>${esc(STORE_PHONE)}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Receipt ${id}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #000;
    background: #fff;
    width: ${RECEIPT_WIDTH};
    padding: 4mm 3mm 8mm;
  }

  /* ── Header ── */
  .header { text-align: center; margin-bottom: 6px; }
  .store-name {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .store-sub { font-size: 10px; margin-top: 2px; }

  /* ── Dividers ── */
  .divider {
    border: none;
    border-top: 1px dashed #000;
    margin: 5px 0;
  }
  .divider-solid {
    border: none;
    border-top: 1px solid #000;
    margin: 5px 0;
  }

  /* ── Meta row ── */
  .meta { display: flex; justify-content: space-between; font-size: 10px; }

  /* ── Items table ── */
  .items { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .item-name { font-weight: bold; padding-top: 4px; word-break: break-word; }
  .item-qty  { color: #333; padding-bottom: 4px; }
  .item-total { text-align: right; padding-bottom: 4px; font-weight: bold; }

  /* ── Summary ── */
  .summary { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .summary-row td { padding: 2px 0; }
  .summary-row td.right { text-align: right; }
  .total-row td {
    font-size: 14px;
    font-weight: bold;
    padding: 4px 0 2px;
    border-top: 1px solid #000;
  }
  .total-row td.right { text-align: right; }

  /* ── Payment ── */
  .payment {
    font-size: 11px;
    margin-top: 4px;
    display: flex;
    justify-content: space-between;
  }

  /* ── Footer ── */
  .footer {
    text-align: center;
    font-size: 10px;
    margin-top: 8px;
    line-height: 1.7;
  }
  .receipt-id { font-size: 9px; color: #555; text-align: center; margin-top: 4px; }

  /* ── Print-only rules ── */
  @media print {
    body { width: 100%; }
    @page {
      size: ${RECEIPT_WIDTH} auto;
      margin: 0;
    }
  }
</style>
</head>
<body>

  <div class="header">
    <div class="store-name">${esc(STORE_NAME)}</div>
    ${STORE_ADDRESS ? `<div class="store-sub">${esc(STORE_ADDRESS)}</div>` : ''}
    ${phoneRow}
  </div>

  <hr class="divider"/>

  <div class="meta">
    <span>${esc(date)}</span>
    <span>${esc(id)}</span>
  </div>
  ${sale.customerName ? `<div class="meta"><span>Customer:</span><span>${esc(sale.customerName)}</span></div>` : ''}

  <hr class="divider"/>

  <table class="items">
    <tbody>${lineRows}</tbody>
  </table>

  <hr class="divider-solid"/>

  <table class="summary">
    <tbody>
      <tr class="summary-row">
        <td>Subtotal</td>
        <td class="right">${fmt(sale.subtotal)}</td>
      </tr>
      ${discountRow}
      <tr class="total-row">
        <td>TOTAL</td>
        <td class="right">${fmt(sale.total)}</td>
      </tr>
    </tbody>
  </table>

  <div class="payment">
    <span>Payment:</span>
    <span>${esc(sale.paymentMethod)}</span>
  </div>

  <hr class="divider"/>

  <div class="footer">
    <p>Thank you for shopping with us!</p>
    <p>Come again soon</p>
  </div>

  <div class="receipt-id">${esc(id)}</div>

</body>
</html>`;
}

// ── Escape HTML ───────────────────────────────────────────────────────────

function esc(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Main export ───────────────────────────────────────────────────────────

export function printReceipt(sale: SalePayload & { receiptId?: string }): void {
  const html = buildReceiptHTML(sale);

  // Create a hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    width: 0;
    height: 0;
    border: none;
    visibility: hidden;
  `;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    console.error('[printReceipt] Could not access iframe document');
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for iframe content to fully load before printing
  const doPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('[printReceipt] print() failed:', e);
    }
    // Clean up iframe after a delay (print dialog may still be open)
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  };

  // Use onload for reliability, fallback to setTimeout
  if (iframe.contentDocument?.readyState === 'complete') {
    doPrint();
  } else {
    iframe.onload = doPrint;
    // Safety timeout in case onload doesn't fire
    setTimeout(doPrint, 800);
  }
}
