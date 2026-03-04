# Branding — where to fix if the UI shows the wrong client name

If this project was overwritten by a client clone (e.g. you see "Hunnid Warehouse" instead of your brand), restore branding in these places.

## Single source of truth (change once)

| File | What to set |
|------|------------------|
| **`src/config/branding.ts`** | `appName`, `appSubtitle`, `receiptTitle` — used by receipts and share sheet |

## Static files (keep in sync with `branding.ts`)

| File | Keys / elements |
|------|------------------|
| **`index.html`** | `<title>`, `<meta name="description">` |
| **`public/manifest.json`** | `"name"`, `"short_name"`, `"description"` |

## Quick restore (this project = Extreme Dept Kidz)

1. **`src/config/branding.ts`** — set `appName` and `receiptTitle` to `'Extreme Dept Kidz'`, `appSubtitle` to `'Inventory & POS'`.
2. **`index.html`** — title: `Extreme Dept Kidz - Inventory & POS`, description: `Extreme Dept Kidz - Modern inventory and point of sale system`.
3. **`public/manifest.json`** — name: `Extreme Dept Kidz - Inventory & POS`, short_name: `EDK POS`, description: `Complete inventory management and point of sale system for Extreme Dept Kidz`.

Search the repo for the wrong name (e.g. `Hunnid`) and replace with your brand in any remaining files.
