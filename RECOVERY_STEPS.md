# Recovery: Make This Repo the Single Source of Truth

## Current state (why features seemed to "revert")

- **Parent repo** ("World-Class Warehouse Inventory & Smart POS System") tracks `warehouse-pos` as a **gitlink** at commit `0316ab4` (old). It does not track files inside `warehouse-pos/`.
- **This repo** (`warehouse-pos/`) is the real app. Your local `main` is at `95a3cd5` (1 commit **ahead** of `origin/main`). You also have **20+ untracked files** (delivery, void API, migrations, docs) that were never committed — so they exist on disk but are not in Git. If anything reverted, it's because the parent was pointing at an old commit or a different clone had more commits pushed.

## Senior-engineer recommendation (exact order)

### Step 1: Commit all current work inside `warehouse-pos` (no more “reverted” work)

Run from repo root (parent), then from `warehouse-pos`:

```bash
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

# Add everything that’s untracked (your features)
git add docs/
git add inventory-server/app/api/sales/void/
git add "inventory-server/supabase/migrations/"
git add src/pages/DeliveriesPage.tsx
git add src/services/salesApi.ts
git add supabase/migrations/

# If you have a file with a space in the name, add it explicitly:
git add "inventory-server/supabase/migrations/Fix 405 deployment" 2>/dev/null || true

# Commit so this state is in history
git commit -m "chore: persist delivery, void API, migrations, and docs (recovery)"
```

If any path fails (e.g. missing folder), skip that line; the rest will still be committed.

### Step 2: Push `warehouse-pos` to GitHub (canonical source)

```bash
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

git push origin main
```

That makes **https://github.com/TheTrustGroup/warehouse-pos** the single source of truth with all your features in Git.

### Step 3: Align the parent repo with this repo (optional but recommended)

So the parent no longer “reverts” to an old snapshot:

**Option A — Update the parent’s pointer to current `warehouse-pos` (keep nested repo):**

```bash
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System"

# Point parent’s warehouse-pos at the latest commit in warehouse-pos
git add warehouse-pos
git commit -m "chore: point warehouse-pos at latest (post-recovery)"
git push origin main   # if you use a remote for the parent
```

**Option B — Single repo (no nested `.git`):**  
Only do this if you want one repo and no submodule-like setup. It rewrites structure.

```bash
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System"
rm -rf warehouse-pos/.git
git add warehouse-pos/
git commit -m "chore: absorb warehouse-pos into single repo"
# Then push parent.
```

Recommendation: use **Option A** unless you explicitly want to merge histories into one repo.

---

## Going forward

1. **Do all feature work inside `warehouse-pos/`.** Commit and push there; that’s your app.
2. **Clone from** `https://github.com/TheTrustGroup/warehouse-pos.git` when you need a fresh copy — it will have everything after Step 2.
3. If you keep the parent repo, run **Option A** after any major warehouse-pos push so the parent doesn’t point at an old commit.
