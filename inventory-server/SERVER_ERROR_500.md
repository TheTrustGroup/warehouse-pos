# Fix "Server error (500)" and products not loading

**In simple terms:** The app has two parts. The **frontend** (what you see in the browser) talks to a **backend API** (the server). Right now the backend is crashing when it tries to load products. You need to give the backend its database settings so it can run.

---

## Which project to configure

You have (at least) two separate things:

| Part | What it is | Where it lives |
|------|------------|----------------|
| **Frontend** | The React app (Inventory, POS, login, etc.) | Often its own Vercel project or host; URL might be like `warehouse.extremedeptkidz.com` |
| **Backend API** | The server that fetches products from the database | The code in **this folder** (`inventory-server/`). It gets deployed as **warehouse-pos-api-v2.vercel.app** (or whatever URL you use for the API) |

**Set the variables in the project that deploys the backend API** — i.e. the **Vercel project that builds and deploys the `inventory-server` app** (the one that ends up at `warehouse-pos-api-v2.vercel.app`).

- If you have one Vercel project that only runs the API: add the variables there.
- If you have one Vercel project that runs both frontend and backend: add the variables there; they will be used by the API routes/functions.
- Do **not** only put them in the frontend project; the frontend does not connect to Supabase for products — the backend does.

---

## Step 1: Fix the 500 (products not loading)

The backend needs two secrets so it can talk to your Supabase database. If they’re missing or wrong, you get a 500 and products never load.

1. **Open your Supabase project** (supabase.com → your project).
2. **Get the two values:**
   - **Project URL** → Settings → API → "Project URL". Copy it. This is **SUPABASE_URL**.
   - **Service role key** → Settings → API → "Project API keys" → **service_role** (secret). Copy it. This is **SUPABASE_SERVICE_ROLE_KEY**. (Use the service role, not the anon key.)
3. **Open the Vercel project that hosts your API** (the one that deploys `inventory-server` and serves `warehouse-pos-api-v2.vercel.app`).
4. **Add environment variables:**
   - Go to **Settings → Environment Variables**.
   - Add:
     - Name: `SUPABASE_URL`  
       Value: the Project URL you copied.
     - Name: `SUPABASE_SERVICE_ROLE_KEY`  
       Value: the service_role key you copied.
   - Save. Apply them to Production (and Preview if you use it).
5. **Redeploy** the backend (Deployments → … on latest deployment → Redeploy), so the new variables are used.

After this, the backend can connect to Supabase. If the 500 was only due to missing env, products should start loading.

---

## Step 2: Make sure the database is set up

The backend expects certain tables (e.g. `warehouse_products`, `warehouse_inventory`). If they don’t exist, you can still get a 500.

- In your **Supabase project** (the same one whose URL and key you added above), run all migrations in this app’s **`inventory-server/supabase/migrations/`** folder so the schema and tables exist.

---

## Step 3: If you still see 401 (optional)

401 on `/admin/api/me` or `/api/auth/user` means “not logged in” or “invalid session” as far as the backend is concerned.

- Try **logging out and back in** on the app.
- If 401 continues, your backend auth (cookies, CORS, or how it checks the session) may not match your frontend. That’s a separate auth setup; the 500 fix above is only for loading products.

---

## Finding the real error (if Step 1 isn’t enough)

To see the exact error the backend is throwing:

1. In **the same Vercel project that runs the API**, go to **Deployments**.
2. Open the latest deployment → **Functions** (or **Logs**).
3. Trigger the products load again in the app (e.g. open Inventory).
4. Find the log for the request to `/api/products`. The code logs the error with `[api/products GET]` — that line will show the real message (e.g. “SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required” or a database error).

That tells you whether the problem is still env vars, missing tables, or something else.
