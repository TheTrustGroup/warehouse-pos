# Trigger.dev setup

Background tasks (e.g. post-sale emails, reports, dashboard precomputation) use [Trigger.dev](https://trigger.dev). **Per ENGINEERING_RULES.md §11:** sale recording, auth, and light reads stay in the API request; only non-critical work goes to Trigger.dev.

## 1. Get your dev secret key

1. Open [cloud.trigger.dev](https://cloud.trigger.dev) and sign in.
2. Select the project (ref: `proj_opxjfhdkefhzyikglvjn`).
3. Go to **API Keys**.
4. Copy the **DEV** secret key (`tr_dev_...`).

## 2. Local env

In `inventory-server/.env.local` (create if needed), add:

```bash
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxx
```

Use your actual dev key. Do not commit this file.

## 3. Install and run

From **warehouse-pos** root:

```bash
cd inventory-server
npm install
npm run dev:trigger
```

Or with npx:

```bash
cd inventory-server
npx trigger.dev@latest dev
```

The dashboard will show “Waiting for tasks” until the dev server is running. Once it connects, the page refreshes and your tasks appear.

## 4. Trigger a task from the API

Example (type-only import for the task, then trigger by id):

```ts
import { tasks } from "@trigger.dev/sdk";
import type { exampleTask } from "@/trigger/example";

// In a route handler (after the synchronous sale recording, etc.):
const handle = await tasks.trigger<typeof exampleTask>("example-task", { name: "World" });
// handle.id lets you poll or display run status
```

## 5. Production setup

You can run Trigger.dev in production so your live API (e.g. on Vercel) can trigger tasks and Trigger.dev Cloud runs them.

### 5.1 Get the production secret key

1. Open [cloud.trigger.dev](https://cloud.trigger.dev) → your project.
2. Go to **API Keys**.
3. Copy the **PRODUCTION** secret key (`tr_prod_...`). Use this only in production; never commit it.

### 5.2 Set env in Vercel (inventory-server)

1. Vercel → project that deploys **inventory-server** (the Next.js API).
2. **Settings** → **Environment Variables**.
3. Add:
   - **Name:** `TRIGGER_SECRET_KEY`
   - **Value:** your production key (`tr_prod_...`)
   - **Environments:** Production (and Preview if you want tasks in preview deploys).
4. Save and **redeploy** the API so the new env is applied.

### 5.3 Deploy your tasks to Trigger.dev

Tasks must be deployed so Trigger.dev Cloud can run them (not just your local dev server).

**First-time / local:** Log in so the CLI can deploy:

```bash
cd warehouse-pos/inventory-server
npx trigger.dev@latest login
```

Then deploy:

```bash
npm run deploy:trigger
```

Or: `npx trigger.dev@latest deploy`

**CI / non-interactive:** Set a Personal Access Token so deploy doesn’t require a browser. Create one at [cloud.trigger.dev/account/tokens](https://cloud.trigger.dev/account/tokens), then:

```bash
TRIGGER_ACCESS_TOKEN=tr_pat_xxxxxxxx npm run deploy:trigger
```

(or add `TRIGGER_ACCESS_TOKEN` to your CI secrets). The CLI builds and deploys the code in `trigger/` to your Trigger.dev project. After this, when your production API calls `tasks.trigger(...)`, the run happens in Trigger.dev Cloud.

### 5.4 Summary

| Where | Key | Purpose |
|-------|-----|--------|
| Local (`inventory-server/.env.local`) | `tr_dev_...` | `npm run dev:trigger` runs tasks locally. |
| Vercel (inventory-server env vars) | `tr_prod_...` | Production API can trigger tasks; Trigger.dev Cloud runs them. |
| Deploy CLI (`TRIGGER_ACCESS_TOKEN`) | `tr_pat_...` | **Personal Access Token** only. Not dev/prod secret keys. Create at [account/tokens](https://cloud.trigger.dev/account/tokens). |

After setting `TRIGGER_SECRET_KEY` in Vercel and running `deploy:trigger` once, production is set. Redeploy the API whenever you change env; run `deploy:trigger` again when you add or change tasks.

## Layout

| Path | Purpose |
|------|--------|
| `inventory-server/trigger.config.ts` | Project ref, task dirs, retries, max duration. |
| `inventory-server/trigger/*.ts` | Task definitions (id + run). |
| `inventory-server/.env.local` | `TRIGGER_SECRET_KEY` (dev). |
