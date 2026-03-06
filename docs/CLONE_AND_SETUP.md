# Clone and setup — use this repo as a source for new projects

This repo is a **full-stack template**: Vite + React frontend, Next.js API in `inventory-server/`, Supabase (DB + Realtime + Storage + Edge Functions). Follow these steps to clone and run a duplicate project.

---

## 1. Clone the repo

```bash
git clone https://github.com/TheTrustGroup/warehouse-pos.git my-new-project
cd my-new-project
```

---

## 2. Environment (frontend)

From **repo root**:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set at least:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Backend API URL, no trailing slash. Local: `http://localhost:3001`. Production: your deployed API URL. |

Optional (for product images and Realtime): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from Supabase project → Settings → API).

See **docs/ENVIRONMENT.md** for full list.

---

## 3. Environment (inventory-server / API)

```bash
cd inventory-server
cp .env.example .env.local
```

Edit `inventory-server/.env.local` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL (Settings → API). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-only). |
| `SESSION_SECRET` | Yes (production) | Session signing secret, min 16 chars. |

Optional: `RESEND_API_KEY` (receipt emails), `UPSTASH_REDIS_*` (dashboard cache). See **docs/ENVIRONMENT.md** and **inventory-server/.env.example**.

---

## 4. Database (Supabase)

- Create a **Supabase project** (or use an existing one).
- In Supabase: **SQL Editor** → run migrations in **timestamp order** from:
  - `inventory-server/supabase/migrations/*.sql`
- Ensure the project has **Realtime** enabled for the tables you use (e.g. `warehouse_inventory_by_size` if using POS realtime).
- Optional: **Storage** bucket for product images; see **docs/IMAGES.md** and RLS in migrations.

---

## 5. Run locally

**Terminal 1 — API:**

```bash
cd inventory-server
npm install
npm run dev
```

API: **http://localhost:3001**. Check `GET http://localhost:3001/api/health` returns `{"status":"ok"}`.

**Terminal 2 — Frontend:**

```bash
# from repo root
npm install
npm run dev
```

App: **http://localhost:5173**. Set `.env.local`: `VITE_API_BASE_URL=http://localhost:3001`.

---

## 6. Branding (for the duplicate project)

Change app name and receipt title so the clone is not “Extreme Dept Kidz”:

| File | What to set |
|------|-------------|
| **`src/config/branding.ts`** | `appName`, `appSubtitle`, `receiptTitle` |
| **`index.html`** | `<title>`, `<meta name="description">` |
| **`public/manifest.json`** | `name`, `short_name`, `description` |

See **docs/BRANDING.md** for the full checklist.

---

## 7. Deploy (Vercel typical setup)

- **Frontend:** Vercel project from repo root; build `npm run build`, output `dist`. Env: `VITE_API_BASE_URL` = your deployed API URL.
- **API:** Second Vercel project (or monorepo subpath) with root `inventory-server`; build `npm run build`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and any optional (Resend, Redis).
- **Supabase:** Migrations already run (step 4). For Edge Functions (e.g. send-receipt, low-stock-alert): deploy with Supabase CLI from `inventory-server` and set secrets in Supabase dashboard.

See **docs/DEPLOY_AND_STOCK_VERIFY.md** and **docs/ENGINEERING_RULES.md** (§10).

---

## 8. After cloning — repo discipline

- All app code lives in this repo. Commit and push from the **repo root** (or from `warehouse-pos` if this folder is named that).
- Migrations live in `inventory-server/supabase/migrations/`. Commit them with the code that uses them.
- Before you leave or switch machine: `npm run guard:uncommitted` (fails if there are uncommitted changes). See **docs/ENGINEERING_RULES.md**.

---

## Quick reference

| Need | Doc |
|------|-----|
| Env vars (all) | **docs/ENVIRONMENT.md** |
| Branding | **docs/BRANDING.md** |
| Deploy + verify | **docs/DEPLOY_AND_STOCK_VERIFY.md** |
| Commit/discipline | **docs/ENGINEERING_RULES.md** |
| Architecture | **docs/ARCHITECTURE_AND_ROADMAP.md** |
