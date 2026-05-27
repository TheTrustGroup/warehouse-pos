# Data Durability Guarantee

This document describes how the warehouse inventory and POS system guarantees that **no product or inventory save is reported as successful without durable persistence**, how we prevent silent failures and partial writes, and how **the same data and experience** are preserved across devices and browsers.

---

## 1. What Caused Previous Loss Risk

- **Non-atomic product creates/updates**  
  Creating or updating a product involved multiple separate database operations (insert/update `warehouse_products`, then `warehouse_inventory`, then `warehouse_inventory_by_size`). If any step failed after the first committed, the system could end up with:
  - A product row without inventory rows
  - Inventory-by-size rows without a matching total in `warehouse_inventory`
  - Orphaned rows if rollback (e.g. delete product) failed or didn’t cover all tables

- **Success shown before persistence was proven**  
  The UI could show “Saved” as soon as the API returned 2xx. Read-after-write verification ran in the background. If verification failed, the user had already seen success and the list could be wrong.

- **No single transaction for multi-table writes**  
  Product + inventory + by-size were not in one database transaction, so partial commits were possible under failure or crash.

- **Limited traceability**  
  Failed or partial saves were not consistently logged with correlation IDs, making it hard to prove what was written and to debug “saved but missing” reports.

---

## 2. How Atomicity Is Ensured

- **Atomic RPCs for product create/update**  
  The backend uses two Postgres functions, called via Supabase RPC:
  - `create_warehouse_product_atomic`: in **one transaction** inserts into `warehouse_products`, upserts `warehouse_inventory`, and (when sized) writes `warehouse_inventory_by_size`. Either all succeed or the transaction rolls back and none are committed.
  - `update_warehouse_product_atomic`: in **one transaction** updates `warehouse_products` (with version check), then updates `warehouse_inventory` and `warehouse_inventory_by_size` as needed. Again, all or nothing.

- **Fallback when RPCs are not deployed**  
  If the atomic RPCs are not yet present (e.g. migration not run), the app falls back to the legacy multi-step create/update. That path is not atomic; the RPC path is the durability target and should be deployed for production.

- **Sales and deductions already atomic**  
  POS sales and inventory deductions were already implemented via single-transaction RPCs (`process_sale`, `process_sale_deductions`, `process_return_stock`). No change to that behavior.

---

## 3. Why Silent Failure Is Impossible Now

- **Server returns success only after commit**  
  The API handlers call the data layer and return 2xx only after the data layer returns. The atomic RPC path commits in one transaction; the handler does not respond with success until the RPC (and thus the transaction) has completed successfully. There is no fire-and-forget write; all writes are awaited.

- **Explicit failure response**  
  If the RPC or any step throws, the API returns a non-2xx status and a clear error message. Failures are not swallowed; they are logged and returned to the client.

- **Structured durability logging**  
  Every product create/update attempt is logged with:
  - `[INVENTORY_SAVE]` + `status` (success | failed)
  - `entity_type`, `entity_id`, `warehouse_id`, `request_id`, `user_role`
  - On failure: `message` (no PII).  
  So every failed or partial-attempt is visible in logs and can be correlated with a request.

- **Frontend does not assume success**  
  The UI does not show “Saved” on an assumption or before the server confirms. It only shows success after:
  1. The API returns 2xx (server has committed the write), and  
  2. Read-after-write verification succeeds (see below).  
  If verification fails, the UI treats it as a save failure and does not close the form or clear the error.

---

## 4. How the System Proves Persistence

- **Read-after-write verification**  
  After a successful API response for add or update product, the client performs a **blocking** read-after-write check:
  - It re-fetches the product (by id) from the server.
  - Only if that read returns the expected entity does the UI:
    - Update local state/cache with the verified data
    - Resolve the save promise so the modal can close and the “Saved to [warehouse]” toast can show.
  - If the re-fetch fails or the entity is missing, the client:
    - Does **not** update state with unverified data
    - Refreshes the list in the background
    - Throws so the user sees an error and the form stays open (no form reset, no lost input).

- **Save acknowledgment**  
  The server returns the created/updated entity (including `id`) in the response. The client uses that `id` for the read-after-write request. The toast shows “Saved to [warehouse name]” only after verification, giving a clear confirmation that the save is visible on the server.

- **No optimistic UI for saves**  
  Product add/update do not show “Saved” before the server confirms and verification passes. Loading state is kept until the full flow (API success + verify) completes. Duplicate submit is still guarded by existing loading/submit flags.

---

## 5. Verification Checklist (Must Pass)

| Check | How it’s guaranteed |
|-------|---------------------|
| Save product → refresh → product exists | Atomic create RPC + 2xx only after commit; client verify before showing success. |
| Save inventory → switch device → inventory exists | Same: persistence is server-side in one transaction; other devices read from same API. |
| Network drop mid-save | Request fails; no 2xx; client shows error; no “Saved” toast; form stays open; no state update from an unconfirmed write. |
| Server error | Non-2xx response; durability log with status=failed; client shows error and does not show “Saved”. |
| Duplicate save attempts | Idempotency key on create; version check on update (409 on conflict); no double-insert from normal retry. |

---

## 6. Summary

- **Durability over speed/convenience:** We do not report success until the server has committed and the client has verified the write.
- **No silent failure:** Every failure path returns an error to the client and logs a structured `[INVENTORY_SAVE]` entry.
- **No partial commits for product/inventory:** Atomic RPCs ensure product + inventory + by-size are written in a single transaction.
- **Proven persistence:** We only show “Saved” when we have server-confirmed data (response body or read-after-write GET).

This makes it impossible for a save to “appear successful” without persistence and ensures the system behaves like a reliable ledger for inventory and product data.

---

## 7. Is There Zero Room for Data Loss?

**What's in place:**

- **Atomic writes:** Product create/update use a single DB transaction (RPC) when the migration is applied; no partial commits.
- **Success only after commit:** The API returns 2xx only after the data layer (and thus the transaction) completes; no fire-and-forget.
- **No silent success:** Every failure is returned to the client and logged with `[INVENTORY_SAVE] status=failed`.
- **Verified before "Saved":** The UI shows "Saved to [warehouse]" only after we have server-confirmed data (response body or read-after-write GET).
- **One round-trip when possible:** When the server returns a full product in the response, we use it as verified and skip the extra GET, so save is **swifter** (single round-trip). If the response is minimal, we still do a read-after-write GET and show "Verifying…" so the user sees progress.

**Residual risk (edge cases):**

- **Replication lag:** If the database uses read replicas and the verify GET hits a replica, it could theoretically miss a just-committed write. Using the **response body as verified** when it's complete avoids that for the common path.
- **Total outage:** If the DB or app crashes after commit but before the HTTP response is sent, the client will see an error and not show "Saved"; the data may or may not be on disk depending on DB durability settings.
- **Legacy path:** If the atomic RPC migration is not applied, the code falls back to the legacy multi-step create/update, which is not atomic. Deploy the migration for production.

So: we have **minimal, well-defined room for loss**; normal saves are durable and not reported as success without persistence. "Zero" in the strictest sense would require a single-node, sync-replicated DB and no legacy path.

---

## 8. Save Button: Swifter and Clearer

- **Swifter:** When the server returns the full created/updated product in the response (normal case), we use that as the verified entity and **do not** perform a second GET. That makes the typical save **one round-trip** instead of two.
- **Clearer:** The save button shows **"Saving…"** during the API call and **"Verifying…"** only when we do the read-after-write GET (e.g. when the response is minimal). So the user sees progress and understands why it might take a moment when verification runs.

---

## 9. Same Data and Look Across Devices and Browsers

- **Single source of truth:** All devices and browsers use the same backend (`API_BASE_URL`). Product and inventory lists are always loaded from the server; there is no device-specific source of truth.
- **Same warehouse, same list:** The list is scoped by `warehouse_id` from the session/context. Any device logged in with the same warehouse sees the same products and quantities once the list is loaded or refreshed.
- **Short-lived cache:** The client uses a per-warehouse cache with a short TTL (e.g. 60s) and "bypass cache" on key navigations (e.g. opening Inventory) so that switching devices or browsers and refreshing shows up-to-date data.
- **Consistent UI:** The app uses a single codebase, viewport meta, and theme; layout and behavior are the same across supported browsers and devices. Local storage and IndexedDB are used only as a cache or for offline fallback; they do not override server data when the API is available.
- **After save:** Because saves are durable and we only show "Saved" after server confirmation (and optional verify), a save completed on one device will appear on any other device after refresh or when the list is next loaded from the server.
