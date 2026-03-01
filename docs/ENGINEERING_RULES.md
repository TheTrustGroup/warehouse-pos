# Engineering Rules — Avoid Lost Work & Repo Confusion

**Why this exists:** We lost track of work (uncommitted files, nested repo pointer, UI differences) and had to recover. These rules prevent that from happening again.

---

## 1. Single source of truth

- **The app is this repo:** `warehouse-pos/` (remote: `https://github.com/TheTrustGroup/warehouse-pos`).
- All feature work happens **inside** `warehouse-pos/`. Commit and push **here**.
- The parent folder ("World-Class Warehouse Inventory & Smart POS System") may contain a gitlink to this repo; treat it as a wrapper. Do **not** rely on it for history or backup.

---

## 2. Commit and push discipline

| Rule | Action |
|------|--------|
| **Commit at feature boundaries** | One logical change = one commit (e.g. "feat: size/color filter pills", "fix: POS search filter"). |
| **No "work in progress" for days** | If you leave uncommitted changes overnight or switch machines, you risk losing them. Commit at least at end of day. |
| **Push after commit** | `git push origin main` after committing so GitHub has your work. |
| **Migrations and seeds** | Any new `.sql` under `supabase/migrations/` or `inventory-server/supabase/migrations/` must be committed in the same PR/commit as the code that uses them. |

---

## 3. Before you leave (end of day / switch machine / close project)

Run from **inside** `warehouse-pos/`:

```bash
cd warehouse-pos   # or your path to this repo

# 1. See uncommitted work
git status -sb

# 2. If anything is modified or untracked, commit and push
git add -A
git status
git commit -m "chore: persist WIP (filters/docs/migrations)"   # or a descriptive message
git push origin main
```

Or use the script: **`npm run guard:uncommitted`** (see below). If it exits non-zero, fix before leaving.

---

## 4. Guard script (uncommitted changes)

A script runs `git status --porcelain` and **exits 1** if there are uncommitted or untracked files, so CI or a pre-exit habit can catch "forgot to commit."

- **When to run:** End of day, before closing IDE, or in CI as a soft check (optional).
- **Command:** `npm run guard:uncommitted` (from `warehouse-pos/`).

---

## 5. UI and feature parity

- **Screenshots / designs are reference.** If a UI (e.g. filters by size and color as pills) exists in a design or another deployment, implement it in this repo and **commit** it. Do not assume "it’s somewhere else."
- **One codebase.** Avoid maintaining the same feature in multiple clones or brands without merging back here. Prefer feature flags or env-based branding if you need variants.

---

## 6. Migrations and seeds

- **All migrations** live under:
  - `inventory-server/supabase/migrations/` (timestamped, applied via Supabase)
  - or `supabase/migrations/` (if used)
- **Seeds** are in migrations (e.g. `seed_size_codes_*`) or `inventory-server/supabase/scripts/`.
- **Rule:** Adding a DB change = add migration + commit it in the same commit/PR as the code that depends on it. Never leave migrations uncommitted.

---

## 7. Checklist for new features

- [ ] Code change in `warehouse-pos/`.
- [ ] Any new migration/seed committed.
- [ ] `npm run test` and `npm run build` pass.
- [ ] `git add` / `git commit` with a clear message.
- [ ] `git push origin main`.
- [ ] (Optional) Run `npm run guard:uncommitted` to confirm clean state.

---

## 8. Mobile parity and why updates don’t show on mobile

**Symptom:** Features and updates are visible on desktop but not on mobile.

**Causes and what to do:**

| Cause | What to do (senior-engineer level) |
|-------|-------------------------------------|
| **Nav drift** | Sidebar and MobileMenu each define `baseNavigation`. Adding a route only to Sidebar hides it on mobile. **Rule:** When adding a nav item, add it in both `Sidebar.tsx` and `MobileMenu.tsx` (or refactor to a single shared nav config and import in both). |
| **Stale cache (service worker)** | When offline/PWA is enabled, the service worker caches assets. After a deploy, the app shows a toast “App updated – Refresh to see changes” but does not reload. Mobile users often leave the tab open and don’t refresh. **Options:** (1) Call `registration.waiting?.postMessage({ type: 'SKIP_WAITING' })` when the user taps “Refresh” in the toast and handle `controllerchange` by `window.location.reload()`. (2) Optionally: on `visibilitychange` (tab focus), check a `/version.json` or `Last-Modified` on the SW script and prompt reload if newer. |
| **Stale cache (browser)** | Ensure `index.html` is never cached by the origin or CDN (e.g. `Cache-Control: no-store` for `/` and `/index.html`). The app already sets meta `no-cache` in `index.html`; also set these headers in Vercel/host so mobile browsers don’t keep an old shell. |
| **Build / deploy** | Confirm the same build is deployed to the URL mobile uses (no separate “mobile” build or domain that’s not updated). |

**Checklist when adding a feature that must appear on mobile:**

- [ ] New nav link added to **`src/config/navigation.tsx`** only (Sidebar and MobileMenu import from it).
- [ ] No CSS or logic that hides the feature only on small viewports (e.g. `lg:block` without a mobile equivalent) unless intentional.
- [ ] After deploy, test on a real device or Chrome DevTools device mode; if using PWA, tap "Refresh" in the update toast or hard refresh to pick up the new SW.

---

## 9. Performance (all devices)

- **Build:** Vite splits vendor into `react-vendor`, `router`, `recharts`, `idb`, `framer` for better caching and parallel loading. Target is `es2020` for smaller output on modern devices.
- **Shell:** `index.html` uses non-blocking font loading (preload + async stylesheet) so first paint is not delayed by Google Fonts.
- **Host:** `vercel.json` sets `Cache-Control: no-store` for `/` and `/index.html` so mobile and CDNs always fetch the latest shell; hashed assets remain cacheable.
- **Updates:** When a new deploy is live, the app shows a toast with a "Refresh" button; tapping it reloads the page so users get the new bundle.
- **Nav:** Single nav config in `src/config/navigation.tsx` keeps Sidebar and MobileMenu in sync and avoids duplicate bundle weight.

---

## 10. If you use the parent repo

- After pushing from `warehouse-pos/`, if the parent repo points at `warehouse-pos` as a gitlink, update it so it doesn’t "revert" to an old commit:
  ```bash
  cd "/path/to/World-Class Warehouse Inventory & Smart POS System"
  git add warehouse-pos
  git commit -m "chore: point warehouse-pos at latest"
  git push   # if parent has a remote
  ```

---

**Summary:** Commit and push from `warehouse-pos/` at feature boundaries and before you leave. Use the guard script to avoid leaving uncommitted work. Keep one source of truth (this repo). Migrations and UI changes stay in version control with the code that uses them. Keep Sidebar and MobileMenu nav in sync via `src/config/navigation.tsx`; control caching so mobile users get updates (see §8); see §9 for performance choices and §10 for parent repo.
