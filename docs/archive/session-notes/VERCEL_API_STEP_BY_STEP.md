# Step-by-step: Deploy the inventory API on Vercel

Follow these steps in order. You’ll create a **second** Vercel project (the API), then point your existing warehouse frontend at it.

---

## Step 1: Open Vercel and start a new project

1. Go to **https://vercel.com** and sign in.
2. From the dashboard, click **“Add New…”** (top right).
3. Choose **“Project”**.

---

## Step 2: Import your repository

1. You’ll see a list of repositories connected to Vercel.
2. Find the repo that contains your **warehouse-pos** app (the one you already use for warehouse.extremedeptkidz.com).
3. Click **“Import”** next to that repo.

---

## Step 3: Configure the project — set Root Directory

On the **Configure Project** screen:

1. Find the **“Root Directory”** row.  
   It usually says something like `./` or is empty (meaning “use repo root”).

2. Click **“Edit”** (or the pencil) next to **Root Directory**.

3. In the text field that appears, type **exactly**:
   ```text
   warehouse-pos/inventory-server
   ```
   - No leading slash.
   - No trailing slash.
   - Same spelling: `warehouse-pos` then `/` then `inventory-server`.

4. Confirm (e.g. click **Continue** or click outside the field so it saves).

5. **Important:** Under Root Directory, set **"Include files outside the root directory in the Build Step"** to **Disabled**.  
   If this is enabled, Vercel can pick up the repo’s root `vercel.json` (Vite/frontend) and the API routes will 404. The API project must use only the `inventory-server` folder.

6. Check the rest of the settings:
   - **Framework Preset:** should show **Next.js** (Vercel detects it from the `inventory-server` folder).
   - **Build Command:** `npm run build` (default is fine).
   - **Output Directory:** leave default.
   - **Install Command:** `npm install` (default is fine).

6. **Do not deploy yet.** Click **“Environment Variables”** (or expand that section) so we can add them before the first deploy.

---

## Step 4: Add environment variables (before first deploy)

Still on the Configure Project page (or in **Settings → Environment Variables** after creation):

Add these **three** variables. For each one, choose **Production** (and optionally **Preview** if you want preview deployments to use the API too).

| Name | Value | Where to get it |
|------|--------|------------------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase dashboard → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` long string | Supabase dashboard → Project Settings → API → `service_role` (secret) |
| `CORS_ORIGINS` | `https://warehouse.extremedeptkidz.com` | Your frontend URL. Or use `*` to allow any origin. |

- For **CORS_ORIGINS**: if you have multiple frontend URLs, separate with commas, e.g.  
  `https://warehouse.extremedeptkidz.com,https://warehouse-pos.vercel.app`

---

## Step 5: Deploy the API project

1. Click **“Deploy”** (bottom of the Configure Project page).
2. Wait for the build to finish (usually 1–2 minutes).
3. When it’s done, you’ll see a **“Visit”** link or a project URL like:
   ```text
   https://inventory-server-xxxxx.vercel.app
   ```
4. **Copy that full URL** (no trailing slash). You’ll use it in the next section.

Optional check: open in a browser:
```text
https://your-api-url.vercel.app/api/products
```
You should see `[]` (empty array) or a JSON list, not a 404 or HTML page.

---

## Step 6: Point the frontend at the API

1. In Vercel, open the **other** project — the one for your **warehouse frontend** (warehouse.extremedeptkidz.com).
2. Go to **Settings** → **Environment Variables**.
3. Add a new variable:
   - **Key:** `VITE_API_BASE_URL`
   - **Value:** the API URL you copied in Step 5, e.g. `https://inventory-server-xxxxx.vercel.app`  
     (no trailing slash)
   - **Environments:** check **Production** (and **Preview** if you want).
4. Save.

---

## Step 7: Redeploy the frontend

The frontend only picks up `VITE_API_BASE_URL` when it **builds**. So you must trigger a new deployment:

1. In the **warehouse frontend** project, go to the **Deployments** tab.
2. Find the latest deployment.
3. Click the **three dots (⋯)** on the right.
4. Click **“Redeploy”**.
5. Confirm **“Redeploy”** again (don’t change any settings).
6. Wait for the new deployment to finish and become **Production**.

After that, open **https://warehouse.extremedeptkidz.com** again. The app should reach the API and the “Server unreachable” message should go away (as long as the API project is still deployed and env vars are set).

---

## Quick reference: Root Directory

| Project | Root Directory |
|--------|-----------------|
| **API (inventory-server)** | `warehouse-pos/inventory-server` |
| **Frontend (warehouse-pos)** | `warehouse-pos` (or whatever you used when you first imported; often the repo root if the repo is only warehouse-pos) |

If you ever need to change the API project’s root later: **Settings** → **General** → **Root Directory** → **Edit** → set to `warehouse-pos/inventory-server` → Save, then redeploy.
