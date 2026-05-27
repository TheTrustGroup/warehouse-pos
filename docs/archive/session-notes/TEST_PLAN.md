# Comprehensive Test Plan — Warehouse & Smart POS

This document covers manual and cross-environment testing for the Warehouse Inventory & Smart POS application. Use it for release validation, regression, and browser/device compatibility.

---

## Prerequisites

- **Environment**: App running locally (`npm run dev`) or against a deployed URL (e.g. Vite build + preview or production).
- **Backend**: API at `VITE_API_BASE_URL` must be reachable for online tests; use mock/offline mode for offline tests.
- **Test accounts** (adjust to your backend):
  - **Admin**: e.g. `info@extremedeptkidz.com` (or your admin email) → lands on Dashboard (`/`).
  - **POS/Cashier**: e.g. `cashier@extremedeptkidz.com` or `maintown_cashier@extremedeptkidz.com` → lands on POS (`/pos`).

---

## 1. Admin login → Product list loads immediately

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 1.1 | Open app, go to `/login`. | Login page loads; email and password fields visible. | ☐ |
| 1.2 | Enter **admin** email and password; submit. | No validation errors; loading state on button; then redirect to **Dashboard** (`/`). | ☐ |
| 1.3 | From Dashboard, navigate to **Inventory** (link or Quick Action). | Inventory page loads; product list appears. | ☐ |
| 1.4 | Observe initial load. | Product list loads **immediately** (from cache if available) or shows loading then list; no blank screen for several seconds. | ☐ |
| 1.5 | Check for errors in UI (toast, banner, empty error message). | No "Invalid products response" or generic error; list shows products or empty state. | ☐ |

**Notes**: Product list uses per-warehouse cache (e.g. 60s TTL). First load after login may fetch from API; subsequent open of Inventory within TTL should be instant from cache.

---

## 2. POS login → Role-based routing

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 2.1 | Log out if needed; go to `/login`. | Login page. | ☐ |
| 2.2 | Enter **cashier/POS** email and password; submit. | Redirect to **POS** page (`/pos`), not Dashboard. | ☐ |
| 2.3 | In address bar, manually go to `/` (Dashboard). | If role is cashier: redirect to `/pos` (no access to Dashboard). | ☐ |
| 2.4 | Manually go to `/inventory`. | If inventory view allowed for role: Inventory loads; else redirect (e.g. to `/pos`). | ☐ |
| 2.5 | Manually go to `/settings`, `/reports`, etc. | Admin-only routes redirect cashier to `/pos` or default path; no crash. | ☐ |
| 2.6 | Log out; log in as **admin** again. | Admin lands on Dashboard (`/`); can access Inventory, Settings, Reports. | ☐ |

**Notes**: Cashier default path is `/pos`; admin/super_admin/manager default is `/`. Protected routes use `allowedRoles` and `redirectPathIfForbidden="/pos"`.

---

## 3. Create new product → Appears instantly in list

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 3.1 | Log in as **admin**; go to **Inventory**. | Product list visible. | ☐ |
| 3.2 | Click **Add product** (or equivalent) to open product form modal. | Modal opens with empty form; required fields marked (e.g. name, SKU, category). | ☐ |
| 3.3 | Fill required fields: Name, SKU, Category, Quantity, Cost price, Selling price, Reorder level. | No validation errors on valid input. | ☐ |
| 3.4 | Submit form. | Button shows loading (e.g. "Saving…"); no double submit. | ☐ |
| 3.5 | On success: modal closes. | New product appears **in the list immediately** (no need to refresh or re-open Inventory). | ☐ |
| 3.6 | Confirm new row: name, SKU, quantity, prices match. | Data matches what was entered. | ☐ |
| 3.7 | (Optional) Submit with invalid data (e.g. empty name). | Validation error (toast or inline); modal stays open; no API call or list update. | ☐ |

**Notes**: Create flow should optimistically or immediately after API success update local state so the new product is visible without a full reload.

---

## 4. Edit existing product → Changes persist and display

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 4.1 | From Inventory, open **Edit** on an existing product. | Modal opens with form pre-filled. | ☐ |
| 4.2 | Change one or more fields (e.g. name, quantity, selling price). | Values update in form. | ☐ |
| 4.3 | Submit. | Button shows loading; modal closes on success. | ☐ |
| 4.4 | Check the same product in the list. | List row shows **updated** values (name, quantity, price, etc.). | ☐ |
| 4.5 | Refresh the page (F5 or reload). | After reload, product still shows **updated** data (persisted to server). | ☐ |
| 4.6 | (Optional) Open product in another tab or device (if same backend). | Same updated data visible. | ☐ |

**Notes**: Edit uses PUT to API; success should update local state and optionally refetch so the list is correct without refresh.

---

## 5. Desktop browsers (Chrome, Firefox, Safari, Edge)

| Browser | Version | Login | Admin redirect | POS redirect | Product list | Create product | Edit product | Pass/Fail |
|---------|---------|--------|-----------------|--------------|--------------|-----------------|--------------|-----------|
| Chrome  | _____   | ☐     | ☐               | ☐            | ☐            | ☐               | ☐            | ☐         |
| Firefox | _____   | ☐     | ☐               | ☐            | ☐            | ☐               | ☐            | ☐         |
| Safari  | _____   | ☐     | ☐               | ☐            | ☐            | ☐               | ☐            | ☐         |
| Edge    | _____   | ☐     | ☐               | ☐            | ☐            | ☐               | ☐            |

**Checklist per browser**: Login (admin and cashier), role redirect, load Inventory, create one product, edit one product, log out. Note any console errors, layout issues, or failed requests.

---

## 6. Mobile (iOS Safari, Chrome Android)

| Device / Browser      | Login | Role redirect | Product list | Create/Edit (form usable) | Pass/Fail |
|----------------------|--------|----------------|--------------|----------------------------|-----------|
| iOS Safari (iPhone)  | ☐      | ☐              | ☐            | ☐                          | ☐         |
| Chrome Android       | ☐      | ☐              | ☐            | ☐                          | ☐         |

**Focus**: Touch targets (min 44px), no zoom on inputs, keyboard behavior, scrolling in modals, list performance. Test both portrait and landscape if relevant.

---

## 7. Slow network (3G throttle)

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 7.1 | Open DevTools → Network; set throttling to **Slow 3G** (or custom: ~400 Kbps down, ~400 Kbps up, high latency). | Throttling active. | ☐ |
| 7.2 | Log in as admin. | Login completes (may take longer); no timeout or indefinite spinner without feedback. | ☐ |
| 7.3 | Go to Inventory. | List eventually loads or shows loading state; no silent failure. | ☐ |
| 7.4 | Create a product. | Submit shows loading; on success modal closes and new product appears; on timeout/error user sees message (toast/error). | ☐ |
| 7.5 | Edit a product. | Same: loading state and clear success or error. | ☐ |
| 7.6 | Remove throttle; retry. | Normal behavior returns. | ☐ |

**Notes**: Prefer visible loading and clear error messages over hanging or blank screens.

---

## 8. Offline behavior

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 8.1 | With app open and logged in, go to Inventory so product list is loaded. | List visible. | ☐ |
| 8.2 | In DevTools → Network, set to **Offline** (or disconnect Wi‑Fi). | Network offline. | ☐ |
| 8.3 | Navigate within app (e.g. Dashboard ↔ Inventory). | Cached data still shown where applicable; no hard crash. | ☐ |
| 8.4 | Try to create or edit a product while offline. | Either: (a) request fails with clear message (e.g. "Cannot reach server") and no corrupt state, or (b) queue for sync and show "saved locally" if implemented. | ☐ |
| 8.5 | On Login page: try **Continue offline** (if shown when server unreachable). | Offline login works with email; user lands on app with local/cached data. | ☐ |
| 8.6 | Go back **Online**. | App can sync or refetch; no permanent broken state. | ☐ |

**Notes**: Offline flow may use localStorage/IndexedDB cache; "Continue offline" is shown when server is unreachable at login.

---

## 9. Multiple tabs

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 9.1 | Log in as admin in **Tab A**; go to Inventory. | List loads. | ☐ |
| 9.2 | Open same app URL in **Tab B** (new tab). | Tab B shows app; if session is shared, user is still logged in. | ☐ |
| 9.3 | In Tab A: create a new product. | Create succeeds; list in Tab A updates. | ☐ |
| 9.4 | In Tab B: go to Inventory (or refresh Inventory). | Tab B shows the new product (after refresh or real-time update). | ☐ |
| 9.5 | In Tab B: edit a product. | Edit succeeds. | ☐ |
| 9.6 | In Tab A: check same product (refresh or navigate). | Tab A shows updated data; no stale state that overwrites server data. | ☐ |
| 9.7 | Log out in one tab. | Other tab: on next action either still works (session) or redirects to login as expected. | ☐ |

**Notes**: Session persistence (e.g. token in storage) is shared across tabs; product list may need refresh in other tabs unless real-time sync exists.

---

## 10. Session persistence after refresh

| Step | Action | Expected result | Pass/Fail |
|------|--------|------------------|-----------|
| 10.1 | Log in as admin; land on Dashboard. | Dashboard visible. | ☐ |
| 10.2 | Refresh the page (F5 or browser refresh). | User remains logged in; Dashboard (or default route) loads again; no redirect to Login. | ☐ |
| 10.3 | Navigate to Inventory; refresh. | Still logged in; Inventory list loads. | ☐ |
| 10.4 | Log in as cashier; land on POS. Refresh. | Still logged in as cashier; POS page loads. | ☐ |
| 10.5 | Close browser completely; reopen app URL. | If session/token is persisted (e.g. localStorage), user is still logged in; else redirect to Login. | ☐ |
| 10.6 | After session expiry (if testable): perform an action. | User is redirected to Login or sees session-expired message; no crash. | ☐ |

**Notes**: Session is restored from storage; `/admin/api/me` (or equivalent) is used to verify session on load.

---

## Summary

- **1–4**: Core flows (admin login + product list, POS routing, create, edit).  
- **5–6**: Cross-browser and mobile.  
- **7**: Slow 3G.  
- **8**: Offline.  
- **9**: Multiple tabs.  
- **10**: Session persistence after refresh.

Record version/build and date when running the plan. For failures, note browser/OS, steps, and error message or screenshot.

**App version / build**: _______________________  
**Date executed**: _______________________  
**Tester**: _______________________
