/**
 * Edge Function: low-stock-alert
 * Trigger: pg_cron at 8am daily (or Supabase Dashboard Cron). Sends one email per warehouse
 * with out-of-stock (qty=0) and low-stock (1<=qty<=LOW_STOCK_THRESHOLD) products. Only sends if there are alerts.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STORE_NAME = Deno.env.get("STORE_NAME") ?? "EXTREME DEPT KIDZ";
const FROM_EMAIL = Deno.env.get("LOW_STOCK_FROM_EMAIL") ?? "onboarding@resend.dev";
const LOW_STOCK_THRESHOLD = Math.max(1, Math.min(20, Number(Deno.env.get("LOW_STOCK_THRESHOLD")) || 3));
const INVENTORY_PAGE_URL = Deno.env.get("INVENTORY_PAGE_URL") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

interface WarehouseRow {
  id: string;
  name: string;
  admin_email: string | null;
}

interface ProductAlertRow {
  product_id: string;
  name: string | null;
  quantity: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAlertHtml(
  warehouseName: string,
  dateStr: string,
  outOfStock: ProductAlertRow[],
  lowStock: ProductAlertRow[]
): string {
  const outRows = outOfStock
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(r.name ?? "—")}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">0</td></tr>`
    )
    .join("");
  const lowRows = lowStock
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(r.name ?? "—")}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${r.quantity}</td></tr>`
    )
    .join("");

  const linkHtml = INVENTORY_PAGE_URL
    ? `<p style="margin:24px 0 0;text-align:center"><a href="${escapeHtml(INVENTORY_PAGE_URL)}" style="color:#dc2626;font-weight:600">Log in to restock →</a></p>`
    : `<p style="margin:24px 0 0;text-align:center;font-size:13px;color:#666">Log in to your inventory to restock.</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Stock Alert — ${escapeHtml(warehouseName)}</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#111;color:#fff;padding:20px 24px;text-align:center">
      <h1 style="margin:0;font-size:20px;font-weight:700">${escapeHtml(STORE_NAME)}</h1>
      <p style="margin:8px 0 0;font-size:13px;opacity:0.9">⚠️ Stock Alert — ${escapeHtml(warehouseName)}</p>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.8">${dateStr}</p>
    </div>
    <div style="padding:24px">
      ${outOfStock.length > 0 ? `
      <h2 style="margin:0 0 12px;font-size:16px;color:#dc2626">OUT OF STOCK (${outOfStock.length} product${outOfStock.length !== 1 ? "s" : ""})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        <thead><tr style="background:#fef2f2"><th style="padding:8px 12px;text-align:left;font-weight:600">Product</th><th style="padding:8px 12px;text-align:right;font-weight:600">Remaining</th></tr></thead>
        <tbody>${outRows}</tbody>
      </table>` : ""}
      ${lowStock.length > 0 ? `
      <h2 style="margin:0 0 12px;font-size:16px;color:#d97706">LOW STOCK (${lowStock.length} product${lowStock.length !== 1 ? "s" : ""})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        <thead><tr style="background:#fffbeb"><th style="padding:8px 12px;text-align:left;font-weight:600">Product</th><th style="padding:8px 12px;text-align:right;font-weight:600">Remaining</th></tr></thead>
        <tbody>${lowRows}</tbody>
      </table>` : ""}
      ${linkHtml}
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
    });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  if (CRON_SECRET) {
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (auth !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[low-stock-alert] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  if (!RESEND_API_KEY) {
    console.error("[low-stock-alert] RESEND_API_KEY not set");
    return new Response(JSON.stringify({ error: "Email not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const fallbackEmail = (Deno.env.get("LOW_STOCK_ALERT_EMAIL") ?? "").trim() || null;

  const { data: warehouseRows, error: whError } = await supabase
    .from("warehouses")
    .select("id, name, admin_email")
    .order("name");

  if (whError) {
    console.error("[low-stock-alert] warehouses", whError.message);
    return new Response(JSON.stringify({ error: "Failed to load warehouses" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const warehouses = (warehouseRows ?? []) as WarehouseRow[];
  const dateStr = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  let sent = 0;

  for (const wh of warehouses) {
    const toEmail = (wh.admin_email ?? "").trim() || fallbackEmail;
    if (!toEmail) continue;

    const { data: invRows, error: alertError } = await supabase
      .from("warehouse_inventory")
      .select("product_id, quantity")
      .eq("warehouse_id", wh.id);

    if (alertError) {
      console.error("[low-stock-alert] warehouse_inventory", wh.id, alertError.message);
      continue;
    }

    const rows = (invRows ?? []) as { product_id: string; quantity: number }[];
    const alertRows = rows.filter((r) => r.quantity === 0 || (r.quantity >= 1 && r.quantity <= LOW_STOCK_THRESHOLD));
    if (alertRows.length === 0) continue;

    const ids = [...new Set(alertRows.map((r) => r.product_id))];
    const { data: products } = await supabase.from("warehouse_products").select("id, name").in("id", ids);
    const nameMap = new Map<string, string>(((products ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? "—"]));
    const outOfStock: ProductAlertRow[] = [];
    const lowStock: ProductAlertRow[] = [];
    for (const r of alertRows) {
      const name = nameMap.get(r.product_id) ?? "—";
      if (r.quantity === 0) outOfStock.push({ product_id: r.product_id, name, quantity: 0 });
      else lowStock.push({ product_id: r.product_id, name, quantity: r.quantity });
    }
    const withNames = { outOfStock, lowStock };

    if (withNames.outOfStock.length === 0 && withNames.lowStock.length === 0) continue;

    const html = buildAlertHtml(wh.name, dateStr, withNames.outOfStock, withNames.lowStock);
    const subject = `⚠️ Stock Alert — ${wh.name} — ${dateStr}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: [toEmail], subject, html }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[low-stock-alert] Resend", wh.id, res.status, data);
      continue;
    }
    sent++;
  }

  return new Response(JSON.stringify({ ok: true, emailsSent: sent }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
