# Push with Token (Trigger Deployment)

Use a **GitHub Personal Access Token (PAT)** to push so your deployment (e.g. Vercel) is triggered.

---

## 1. Get a GitHub token

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. **Generate new token** (classic or fine-grained)
3. Enable **repo** (or at least push access to this repo)
4. Copy the token and keep it secret (don’t commit it)

---

## 2. Push with token (one-time, no saving)

From the **warehouse-pos** folder, run (replace `YOUR_GITHUB_TOKEN` with your token):

```bash
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

git push https://YOUR_GITHUB_TOKEN@github.com/TheTrustGroup/warehouse-pos.git main
```

- First time: set upstream so future `git push` works:

```bash
git push --set-upstream https://YOUR_GITHUB_TOKEN@github.com/TheTrustGroup/warehouse-pos.git main
```

After this, you can use normal `git push` (Git will use your existing credentials).

---

## 3. Alternative: remote URL with token (temporary)

```bash
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

# Set remote URL to include token (only for this push)
git remote set-url origin https://YOUR_GITHUB_TOKEN@github.com/TheTrustGroup/warehouse-pos.git

# Push and set upstream
git push --set-upstream origin main

# Restore URL without token (recommended after push)
git remote set-url origin https://github.com/TheTrustGroup/warehouse-pos.git
```

---

## 4. Security

- **Never** commit the token or put it in a tracked file.
- Prefer the **one-time URL** in section 2 so the token isn’t stored in `git config`.
- If you use section 3, always run the last command to remove the token from the remote URL.

---

## 5. After a successful push

Your connected platform (e.g. Vercel) should start a new deployment automatically. Check its dashboard for the new build.
