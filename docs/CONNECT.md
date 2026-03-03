# How to connect to this project (senior-engineer playbook)

Single source of truth: **`warehouse-pos/`** (Git remote: TheTrustGroup/warehouse-pos). All work happens here. For system design and roadmap, see **ARCHITECTURE_AND_ROADMAP.md**.

---

## 1. Repo and workspace

- **Open in Cursor:** File → Open Folder → `warehouse-pos` (or the parent that contains it).
- **Git:** From `warehouse-pos/` run `git status -sb` and `git remote -v` to confirm you’re on `main` and remote is correct.

---

## 2. Environment

### Frontend (Vite app)

- **Env file:** `.env` (or `.env.local`). Copy from `.env.example` if missing.
- **Required:** `VITE_API_BASE_URL` — local dev: `http://localhost:3001`; production: your deployed API URL (e.g. `https://your-api.vercel.app`).
- **Optional:** `VITE_SUPABASE_URL`, `VITE_SUPER_ADMIN_EMAILS`, `VITE_OFFLINE_ENABLED`, etc.

### Inventory API (Next.js)

- **Env file:** `inventory-server/.env.local`. Copy from `inventory-server/.env.local.example` if missing.
- **Required:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **RBAC/Auth:** `SESSION_SECRET`, `ALLOWED_ADMIN_EMAILS`, `POS_PASSWORD_CASHIER_MAIN_STORE`, `POS_PASSWORD_MAIN_TOWN` (see `inventory-server/ENV_SETUP.md`).
- **CORS (production):** `CORS_ORIGINS` or `FRONTEND_ORIGIN` if frontend is on another domain.

---

## 3. Install and run (full stack)

From a terminal, all paths relative to **`warehouse-pos/`**:

```bash
# 1. Frontend deps
npm install

# 2. API deps
cd inventory-server && npm install && cd ..

# 3. Start API first (port 3001)
cd inventory-server && npm run dev
# Leave running. In another terminal:

# 4. Ensure frontend .env has VITE_API_BASE_URL=http://localhost:3001
# 5. Start frontend
npm run dev
# App: http://localhost:5173
```

---

## 4. Verify connectivity

- **API health:** With inventory-server running, from `warehouse-pos/inventory-server`:
  ```bash
  npm run test:health
  ```
  Or: `curl -s http://localhost:3001/api/health` → expect `{"status":"ok", ...}`.
- **Frontend → API:** Open http://localhost:5173 → log in → Inventory or POS → product list should load (no 404/500 from API).

---

## 5. Before you leave

From `warehouse-pos/`:

```bash
git status -sb
# Commit and push any changes; run optionally:
npm run guard:uncommitted
```

See **docs/ENGINEERING_RULES.md** for commit discipline; **docs/MIGRATIONS.md** for migration order and list.

---

## 6. Deploy (Vercel)

- **Frontend:** From `warehouse-pos/` run `vercel` (or use Cursor’s `/vercel-deploy`). Set `VITE_API_BASE_URL` to the deployed API URL.
- **API:** From `warehouse-pos/inventory-server` run `vercel`. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and POS/auth vars in the Vercel project env.
- **DB:** Run migrations in Supabase in **timestamp order**; see **`docs/MIGRATIONS.md`** for the full list and descriptions.
