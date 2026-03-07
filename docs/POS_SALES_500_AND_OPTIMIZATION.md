# POS: 500 on Sale, “Network connection lost” on Products — and Backend–Frontend Optimization

## What you’re seeing

1. **After completing a sale:** The browser reports a **500** from `POST /api/sales`. The sale does not complete and **product does not deduct**.
2. **Later (second screen):** Requests to **GET /api/products** fail with **“The network connection was lost”**, the product grid is empty, and you see “SYNCING INVENTORY & ORDERS…”.

---

## Why product doesn’t deduct

- Stock is deducted **only on the server**, inside the `record_sale` RPC, when **POST /api/sales** succeeds (200).
- If **POST /api/sales** returns **500**, the server has thrown before or during the RPC. The transaction is rolled back, so:
  - No sale row is inserted.
  - No stock is deducted.
- The frontend does “optimistic” updates (cart clears, UI updates) and then **rolls back** when the API fails. So the UI can look like the sale went through until the error appears; the source of truth is the server.

So: **fixing the 500 on /api/sales is what makes the product deduct correctly.**

---

## Why “network connection was lost” on /api/products

This usually means one of:

- **Serverless cold start / timeout:** The backend (e.g. Vercel) went idle or took too long; the request was cut (browser or proxy) and you see “connection lost”.
- **Cascade after the 500:** After the failed sale, the app may refetch (e.g. CriticalData sync or “New sale”). If the backend is in a bad state or still timing out, those product requests can also fail.
- **Real network blip:** Less common, but possible on mobile or flaky Wi‑Fi.

So the **first** thing to fix is the **500 on /api/sales**. Once that’s fixed, “connection lost” on products often goes down or becomes clearly network-related.

---

## How to make the backend communicate quickly and reliably with the frontend (optimization, high level)

You asked how to make sure the backend communicates quickly with the frontend. Order of operations:

### 1. Reliability first (fix 500 and timeouts)

- **Fix the 500:** Until POST /api/sales returns 200 when it should, nothing else (speed, UX) is stable. That means:
  - Finding the **exact** error in backend logs (e.g. Vercel function logs for the request that returned 500).
  - Fixing that cause (e.g. missing migration, wrong RPC signature, missing sequence, bad data).
- **Avoid “connection lost”:** Ensure:
  - All **migrations** for the sales/record_sale flow are applied on the DB your API uses (including `receipt_seq`, `record_sale` signature, `sales` / `sale_lines` / `sale_reservations`).
  - **Timeouts** are reasonable (e.g. server allows 15s for the sales route; frontend uses ~12s). If the DB or RPC is slow, fix that before raising timeouts.

### 2. Then: “communicate quickly” (latency and perceived speed)

- **Same region:** Host frontend and API (and DB) in the same region so round‑trip time is low.
- **Keep server warm:** For serverless, use a warm-up (e.g. a cheap GET /api/health on a timer) so the first sale after idle doesn’t hit a cold start and timeout.
- **Small payloads:** Send only needed fields in POST /api/sales; avoid huge JSON. You’re already sending a compact payload.
- **Caching where it helps:** Product list can be cached briefly (e.g. 30s) so repeated opens of POS don’t hammer the API; you already have some caching. Don’t cache POST /api/sales.
- **Frontend behavior:**
  - **Timeouts:** Short enough to fail fast (e.g. 12s), not so short that normal slow DB causes false failures.
  - **Retries:** For **GET** (e.g. products), one or two retries on network error can smooth over a single “connection lost”. For **POST /api/sales**, retry only with care (idempotency key, etc.); usually show the error and let the user tap “Charge” again.
  - **Optimistic UI:** You already clear the cart and show success-like state, then roll back on error. That’s the right pattern; the important part is that the **server** is the source of truth and the 500 is fixed.

So: **first fix the 500 and migrations; then tune region, warm-up, timeouts, and retries so the backend “communicates quickly” with the frontend.**

---

## What to do next (concrete)

1. **Get the real 500 reason**
   - In **Vercel** (or wherever the API runs): open the project → **Logs** / **Functions**.
   - Find the **POST /api/sales** request that returned **500** and read the **server log** (e.g. `[POST /api/sales] RPC error:` or `Unexpected error:`). That message (and stack) is the root cause.
   - If you see “relation receipt_seq does not exist” or “function record_sale(...) does not exist”, the DB is missing migrations or the wrong `record_sale` overload is in use.

2. **Confirm migrations**
   - On the **Supabase** (or Postgres) used by the API, ensure:
     - Migration that creates **receipt_seq** (e.g. `20260301120000_receipt_seq.sql`) has been applied.
     - The **record_sale** version that matches your API (e.g. 11-param with `p_delivery_schedule`) is the one deployed (migration `20260306000000_sales_delivery_reserve_and_deduct.sql` or equivalent).

3. **After the 500 is fixed**
   - Test a sale again; product should deduct and no 500.
   - If “network connection was lost” on products still appears sometimes, check:
     - Vercel function duration (cold start, slow RPC).
     - Timeouts (browser, Vercel, DB). Optionally add a lightweight **GET /api/health** and ping it periodically to reduce cold starts.

Once you have the **exact** log line for the 500 (e.g. copy from Vercel), we can map it to a specific code or migration fix.

---

## Resolved: 500 "delivery_status violates not-null constraint"

**Log:** `null value in column "delivery_status" of relation "sales" violates not-null constraint`

**Cause:** For direct (non-delivery) sales, `record_sale` inserts `delivery_status = NULL`. The database had a NOT NULL constraint on `delivery_status`, so the insert failed.

**Fix:** Migration `20260307100000_sales_delivery_status_allow_null.sql` runs:

- `ALTER TABLE sales ALTER COLUMN delivery_status DROP NOT NULL;`

so direct sales can store NULL. Apply this migration to your Supabase (or run the SQL in the SQL editor), then redeploy or retry. After that, POST /api/sales should return 200 and product will deduct.
