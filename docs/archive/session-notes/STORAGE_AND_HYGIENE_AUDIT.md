# Storage & Project Hygiene Audit Report

**Date:** 2025-02-09  
**Scope:** `warehouse-pos` (frontend + inventory-server)  
**Rules followed:** No DB/schema/migration changes, no production data, no env var removal, build preserved.

---

## 1. What Was Removed (and Why It Was Safe)

### 1.1 Dead code

| Item | Location | Why safe |
|------|----------|----------|
| **`cn()` utility** | `src/lib/utils.ts` | Not imported or called anywhere in the codebase. Only definition and export; removal does not affect behavior. |
| **`isDateInputSupported()`** | `src/lib/dateUtils.ts` | Exported but never imported. Dead export; removal is safe. |

### 1.2 Unused dependencies (frontend)

| Package | Why safe |
|---------|----------|
| **`clsx`** | Only used by the removed `cn()` in `utils.ts`. No other imports. |
| **`tailwind-merge`** | Same as above; only used by `cn()`. |

### 1.3 .gitignore

- **Added:** `.next` under a short comment for Next.js (inventory-server), so build output is ignored when working from repo root.
- **Already present and sufficient:** `node_modules`, `dist`, `dist-ssr`, `*.local`, `.vercel`, `.env*.local`, logs, `.DS_Store`.

**Not removed:** No build artifacts, logs, or temp files were found committed; no cleanup of such files was required.

---

## 2. Suspected but Unsafe-to-Remove (or Flagged Only)

### 2.1 Dependencies — do not remove without verification

| Package | Status | Reason |
|---------|--------|--------|
| **`date-fns`** | Unused in source | Not imported anywhere. Could be removed after a single grep/usage check; left in place to avoid build/tooling surprises. |
| **`uuid`** | Unused in source | No `import … from 'uuid'` or `uuidv4` in `src/`. Referenced in docs (e.g. PRODUCTION_AUDIT_REPORT) for possible future use. **Flag only;** do not remove without product confirmation. |
| **`@ericblade/quagga2`** | Unused in source | Barcode scanning library; not imported. POS has a “Scan” icon; feature may be planned. **Flag only.** |

### 2.2 Duplicate / overlapping logic — keep as-is

| Item | Notes |
|------|--------|
| **`SalesChart` (dashboard vs reports)** | Two different components: dashboard uses a simple line chart (date/sales/revenue); reports uses `SalesReport` with bar + pie. Different props and UX; not consolidated. |
| **inventory-server: `app/admin/api/` vs `app/api/`** | Overlapping routes (e.g. login, logout, products). Per audit rules, API routes were not modified or removed. Flag for future consolidation only. |

### 2.3 Scripts and docs

| Category | Notes |
|----------|--------|
| **Push scripts** | `push_to_github.sh`, `push_with_token.sh`, `QUICK_PUSH.sh` serve different workflows (interactive, token-based, quick). Not consolidated; no removal. |
| **Many `.md` / process docs** | Numerous process/deployment docs at repo root. Could be archived or trimmed later; not removed in this audit to avoid losing context. |
| **`inventory-server/public/ok.txt`** | Single-line file; may be used for health checks or deployment. Not removed. |

### 2.4 Code to keep

- **`lib/INVENTORY_FLOW_AND_AUTHORITY.md`** — Documentation; kept.
- **`.gitkeep` files** — Intentional placeholders for empty dirs; kept.
- **All API routes, contexts, POS/inventory logic, auth, migrations** — Out of scope for removal.

---

## 3. Assets

- **Images / icons / fonts / media:** None found under `warehouse-pos` (no `.png`, `.jpg`, `.svg`, `.woff2`, etc.).
- **`public/`:** Only `manifest.json` and `sw.js` (referenced by `main.tsx`). No removal.

---

## 4. Confirmation

| Check | Result |
|-------|--------|
| **Build** | `npm run build` (tsc + vite) **passes.** |
| **Tests** | `npm run test` — **36 tests, 4 files, all pass.** |
| **Runtime behavior** | No routes, contexts, or app logic removed; only unused util and one dead export. |
| **Data paths** | No databases, schemas, migrations, or production data touched. |
| **Environment** | No env vars or env files removed. |

---

## 5. Summary

- **Removed:** 1 unused utility (`cn`), 1 dead export (`isDateInputSupported`), 2 unused dependencies (`clsx`, `tailwind-merge`). **Updated:** `.gitignore` (added `.next`).
- **Flagged:** `date-fns`, `uuid`, `@ericblade/quagga2` (unused in code); duplicate push scripts and process docs (optional future cleanup); admin vs api route overlap (for future consolidation).
- **Intent:** Minimal, reversible cleanup; no behavior or data impact. When in doubt, items were flagged rather than removed.
