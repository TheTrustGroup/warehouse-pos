# 🧪 SURGICAL ISOLATION PLAN — STEP 1 (NON-NEGOTIABLE)

**Goal:** Prove whether data is persisted. No code changes. This step decides everything.

---

## What you’re testing

- **WRITE path:** App → Backend API → Supabase table  
- **READ path:** Supabase table → Backend API → App  

Step 1 only checks: **did the write reach the database?**

---

## STEP 1 — PROVE WHETHER DATA IS PERSISTED

### 1. Pick one “test product” you can recognize later

Before doing anything, decide:

- **Quantity:** e.g. `99` or `777` (unique so you can’t confuse it)
- **Name or SKU:** e.g. `SURGICAL-TEST-001`
- **Warehouse:** e.g. note the exact warehouse/location you choose in the form

You’ll need these to find the row in Supabase.

---

### 2. Add inventory in the app

1. Log in to the app.
2. Go to **Inventory**.
3. Click **Add Product** (or equivalent).
4. Create **one** product with:
   - The quantity you chose (e.g. 99).
   - The name/SKU you chose (e.g. SURGICAL-TEST-001).
   - The warehouse/location you noted.
5. Save / submit.

**Do not refresh the page. Do not navigate away from Inventory yet.**

---

### 3. Open Supabase and open the table

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) and open your project.
2. Go to **Table Editor** (or SQL Editor if you prefer to query).
3. Open the table where **products/inventory** are stored.  
   (Common names: `products`, `warehouse_products`, `inventory` — use whatever your backend uses.)

---

### 4. Check the row

Look for the row that matches the product you just added. Check:

| Check | What to verify |
|-------|-----------------|
| **Is the row there?** | A new row exists for this product (e.g. by name, SKU, or id). |
| **Correct quantity?** | `quantity` (or equivalent column) = value you entered (e.g. 99). |
| **Correct warehouse_id?** | If your table has `warehouse_id`, it matches the warehouse you selected. |
| **Correct product_id?** | If your table has `product_id` or `id`, it’s present and consistent. |

Use filters or SQL so you’re sure you’re looking at the row you just created (e.g. `quantity = 99` or `name = 'SURGICAL-TEST-001'`).

---

## Result interpretation

There are only two outcomes:

| Result | Meaning | Next focus |
|--------|--------|------------|
| **Row not in DB** | The new product never reached Supabase. | **WRITE PATH IS BROKEN** (app → API → DB). Fix: backend/API that receives POST and inserts into Supabase. |
| **Row in DB** with correct quantity, warehouse_id, product_id | Data is persisted correctly. | **READ PATH IS BROKEN** (DB → API → app). Fix: backend read endpoint, mapping, or frontend load/merge logic. |

There is no third option. Do not change code until you have this result written down.

---

## Quick reference: what the app sends

- **Endpoint:** `POST {VITE_API_BASE_URL}/admin/api/products` (fallback: `/api/products`)
- **Body:** One product object (JSON) with at least: `id`, `quantity`, `name`, `sku`, `location.warehouse`, etc.
- **Backend’s job:** Accept that POST and insert/update the corresponding row(s) in your Supabase table.  
  If the row never appears in Supabase, the bug is in that write path (API or Supabase integration).

---

*After you complete Step 1, record: **Row in DB? Y/N**. Then we know whether to fix WRITE or READ.*
