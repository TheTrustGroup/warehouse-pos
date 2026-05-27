# What’s in place now — and what happened after the seed

## 1. Which database are you using now?

You have **one** database that matters for the live app:

| What | Where it’s defined | What it is |
|------|--------------------|------------|
| **Live database** | Vercel project **warehouse-pos-api-v2** → Settings → Environment Variables | The Supabase project whose **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** are set there. |
| **Same DB** | Supabase Dashboard | That Supabase project is the one where you ran `SELECT COUNT(*) FROM warehouse_products` (0 → 1) and where you ran **seed_one_product.sql**. |

So: **you are using that single Supabase project.** The frontend never talks to Supabase directly; it only talks to your API. The API is the only thing that reads/writes that database.

---

## 2. What’s in place now (architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (your app)                                              │
│  • URL: e.g. house.extremedeptkidz.com or localhost              │
│  • Reads VITE_API_BASE_URL → https://warehouse-pos-api-v2...     │
└────────────────────────────┬──────────────────────────────────┘
                               │
                               │  All product requests go here
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  API (Vercel: warehouse-pos-api-v2)                              │
│  • GET /api/products, POST /api/products, etc.                  │
│  • Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY                 │
└────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase (one project)                                         │
│  • Tables: warehouse_products, warehouse_inventory,             │
│    warehouses, stores, etc.                                      │
│  • This is the only DB the API uses                             │
└─────────────────────────────────────────────────────────────────┘
```

- **Frontend** → calls **API** → API reads/writes **that one Supabase project**.
- No second database for “live” products. No frontend–Supabase connection.

---

## 3. What happened after you ran the seed

| Before seed | After seed |
|-------------|------------|
| `warehouse_products` had **0** rows. | `warehouse_products` has **1** row (Sample Product, SEED-001). |
| API returned `{ data: [], total: 0 }`. | API returns that one product (and any you add later). |
| App showed “Server returned no products” / cache fallback. | App shows “1 product found” and the list. |

The seed did **not** create a new database. It **added one row** into the **same** Supabase project the API was already using. So you’re still using the same DB; you just gave it data.

---

## 4. Is this a “fresh start”?

**For product data in this DB: yes.**

- That Supabase project had no products (count 0). You then added one via the seed. So for **this** database it’s a fresh start: one seed product, and everything you add from now on (via the app or API) will be stored there.
- Any “old” products you remember were either in another database (e.g. local, other Supabase project) or were lost from this DB before (reset, wrong project, etc.). They are not in the current DB.

So: **one database, one API, one product list — and that list is “fresh” in the sense that it currently has only what you’ve added since the seed (starting with Sample Product).**

---

## 5. Does this solve all the issues?

| Issue | Solved? |
|-------|--------|
| “Server returned no products” / empty list | **Yes.** The table has data; the API returns it. |
| Products not loading for Main Store | **Yes.** Same DB, same API; Main Store warehouse exists and has that product. |
| Will new products I add **when online** save? | **Yes.** They go to the API → same Supabase DB and stay there. |
| Server cold starts / timeouts / “degraded” banner | **Not by the seed.** Those are API/Vercel/network issues; keep API env correct and consider warming the API. |
| Offline: do products save when server is offline? | **Only if you turn on the offline feature** (see below). |

So the **empty products** issue is solved. Other issues (reliability, offline) are separate.

---

## 6. Will products save when the server is offline?

It depends on a **feature flag**.

**Default (flag off):**

- When the server is **online**: Add/Edit product → request goes to API → saved in Supabase. ✅  
- When the server is **offline** (or unreachable): Add/Edit tries the API → request fails → **product is not saved** to the server. The UI may show an error or “server unavailable”; data is not stored in the cloud.

So **by default, products do not “save” to the server when the server is offline.** They only save when the API call succeeds.

**If you enable offline mode (flag on):**

- You set **VITE_OFFLINE_ENABLED=true** (and rebuild/redeploy the frontend).
- Then when the device is **offline**, Add/Edit writes to **IndexedDB** in the browser and adds a job to a **sync queue**.
- When the device is **back online**, a sync process sends those queued changes to the API, which writes to the **same** Supabase DB.

So with offline mode on, **products can be “saved” while offline** (saved locally), and they **will** save to the same database once the server is reachable again.

Summary:

- **Offline flag off (default):** Saves go only to the API. If server is offline → no save to DB.
- **Offline flag on:** Saves can happen locally while offline, then sync to the same API/DB when online.

---

## 7. Flow summary (what happens now)

**Loading products (e.g. Inventory page):**

1. Frontend calls `GET https://warehouse-pos-api-v2.vercel.app/api/products?warehouse_id=...&limit=1000`.
2. API reads from **Supabase** (`warehouse_products` + `warehouse_inventory` for quantities).
3. API returns `{ data: [...], total: n }`.
4. Frontend shows the list and can store a copy in IndexedDB/localStorage as a **cache** (for “last saved list” when API fails or returns empty).

**Adding a product (server online, default mode):**

1. User clicks Add product and submits.
2. Frontend sends `POST /api/products` (or admin equivalent) to the API.
3. API inserts into **Supabase** (`warehouse_products` + `warehouse_inventory`).
4. Frontend gets the new product from the response and updates the list (no full refetch).

**Adding a product (server offline):**

- **Default (offline flag off):** Request fails → no save to DB. User sees error / “server unavailable.”
- **Offline flag on:** Frontend writes to IndexedDB and sync queue → “Saved locally. Syncing when online.” When back online, sync sends to API → same Supabase DB.

So the **flow** is: one frontend → one API → one Supabase DB. The seed only added the first row into that DB; the rest of the flow was already in place and now has data to show.

---

## 8. Quick reference

| Question | Answer |
|----------|--------|
| Which database am I using? | The Supabase project in the API’s env (**warehouse-pos-api-v2** → SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Same one you seeded. |
| Is this a fresh start? | Yes, for product data in that DB: it had 0 products, now it has 1 (and whatever you add). |
| Do products save when server is offline? | Only if you enable **VITE_OFFLINE_ENABLED=true** (then they save locally and sync to the same DB when online). By default, no. |
| Will new products I add (while online) persist? | Yes. They are stored in that same Supabase DB via the API. |
