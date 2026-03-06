/**
 * Edge Function: send-receipt
 * Trigger: after successful sale when customer_email is provided (invoked by POST /api/sales).
 * Sends a professional HTML receipt email via Resend. Skip silently if no customer_email.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STORE_NAME = Deno.env.get("STORE_NAME") ?? "EXTREME DEPT KIDZ";
const FROM_EMAIL = Deno.env.get("RECEIPT_FROM_EMAIL") ?? "onboarding@resend.dev";

interface SaleRow {
  id: string;
  receipt_id: string;
  customer_name: string | null;
  customer_email: string | null;
  payment_method: string;
  subtotal: number;
  discount_pct: number;
  discount_amt: number;
  total: number;
  sold_by_email: string | null;
  created_at: string;
  warehouse_id?: string;
}

interface SaleLineRow {
  product_name: string | null;
  product_sku: string | null;
  size_code: string | null;
  unit_price: number;
  qty: number;
  line_total: number;
}

function formatGHC(n: number): string {
  return "GH₵" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatPaymentMethod(m: string): string {
  const lower = (m ?? "").toLowerCase();
  if (lower === "mobile_money") return "Mobile Money";
  if (lower === "card") return "Card";
  return "Cash";
}

function buildReceiptHtml(sale: SaleRow, lines: SaleLineRow[]): string {
  const date = new Date(sale.created_at);
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const cashier = sale.sold_by_email ?? "—";
  const paymentLabel = formatPaymentMethod(sale.payment_method);

  const rows = lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(l.product_name ?? "—")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(l.size_code ?? "—")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${l.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${formatGHC(l.unit_price)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${formatGHC(l.line_total)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Receipt ${escapeHtml(sale.receipt_id)}</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#111;color:#fff;padding:20px 24px;text-align:center">
      <h1 style="margin:0;font-size:20px;font-weight:700">${escapeHtml(STORE_NAME)}</h1>
      <p style="margin:8px 0 0;font-size:13px;opacity:0.9">Receipt</p>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 16px;font-size:12px;color:#666">${dateStr} · ${timeStr}</p>
      <p style="margin:0 0 20px;font-size:13px;color:#333">Receipt #${escapeHtml(sale.receipt_id)} · Cashier: ${escapeHtml(cashier)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f8f8f8">
            <th style="padding:8px 12px;text-align:left;font-weight:600">Item</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600">Size</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600">Price</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;font-size:14px">
        <p style="margin:0 0 4px;display:flex;justify-content:space-between"><span>Subtotal</span><span>${formatGHC(sale.subtotal)}</span></p>
        ${sale.discount_amt > 0 ? `<p style="margin:0 0 4px;display:flex;justify-content:space-between"><span>Discount</span><span>−${formatGHC(sale.discount_amt)}</span></p>` : ""}
        <p style="margin:12px 0 0;font-weight:700;font-size:18px;display:flex;justify-content:space-between"><span>Total</span><span>${formatGHC(sale.total)}</span></p>
        <p style="margin:12px 0 0;font-size:12px;color:#666">Payment: ${paymentLabel}</p>
      </div>
      <p style="margin:24px 0 0;text-align:center;font-size:13px;color:#666">Thank you for your purchase.</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  let body: { sale_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const saleId = typeof body.sale_id === "string" ? body.sale_id.trim() : null;
  if (!saleId) {
    return new Response(JSON.stringify({ error: "sale_id required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[send-receipt] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: saleRow, error: saleError } = await supabase
    .from("sales")
    .select("id, receipt_id, customer_name, customer_email, payment_method, subtotal, discount_pct, discount_amt, total, sold_by_email, created_at, warehouse_id")
    .eq("id", saleId)
    .maybeSingle();

  if (saleError) {
    console.error("[send-receipt] sale fetch", saleError.message);
    return new Response(JSON.stringify({ error: "Failed to load sale" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  if (!saleRow) {
    return new Response(JSON.stringify({ error: "Sale not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const sale = saleRow as SaleRow;
  const toEmail = sale.customer_email?.trim();
  if (!toEmail) {
    return new Response(JSON.stringify({ ok: true, skipped: "no customer email" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const { data: linesRows, error: linesError } = await supabase
    .from("sale_lines")
    .select("product_name, product_sku, size_code, unit_price, qty, line_total")
    .eq("sale_id", saleId)
    .order("product_name");

  if (linesError) {
    console.error("[send-receipt] sale_lines fetch", linesError.message);
    return new Response(JSON.stringify({ error: "Failed to load line items" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const lines = (linesRows ?? []) as SaleLineRow[];

  if (!RESEND_API_KEY) {
    console.error("[send-receipt] RESEND_API_KEY not set");
    return new Response(JSON.stringify({ error: "Email not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const html = buildReceiptHtml(sale, lines);
  const subject = `Receipt ${sale.receipt_id} — ${STORE_NAME}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [toEmail],
      subject,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[send-receipt] Resend error", res.status, data);
    return new Response(JSON.stringify({ error: "Failed to send email", detail: data }), { status: 502, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true, messageId: (data as { id?: string }).id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
