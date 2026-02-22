# Add CI workflow via GitHub (OAuth scope workaround)

If `git push` is rejected with **"refusing to allow an OAuth App to create or update workflow ... without workflow scope"**, add the workflow in the GitHub UI:

1. Open **https://github.com/TheTrustGroup/warehouse-pos**
2. Click **Add file** → **Create new file**
3. In the name field type: **`.github/workflows/ci.yml`** (GitHub will create the `.github/workflows` folders)
4. Open the local file **`.github/workflows/ci.yml`** in this repo, copy its entire contents, and paste into the GitHub editor
5. Scroll down, click **Commit new file** → **Commit directly to main**
6. Go to the **Actions** tab; the CI run should start. In **Settings → Secrets and variables → Actions → Variables** add **VITE_API_BASE_URL** (your API URL) so the frontend build uses it.

After that you can delete this file if you like.
