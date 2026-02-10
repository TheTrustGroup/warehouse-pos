# Phase 4: Offline-capable POS with guaranteed reconciliation

**Status:** Implemented  
**Constraints:** No inventory loss, no double deductions, no breaking API changes, server remains source of truth.

---

## 1. Objectives

- POS works during **network loss**, **high latency**, and **partial backend outage**.
- All offline sales are **replayed safely**, **deduct inventory exactly once**, and **preserve order integrity**.
- Admin can see **sync status**, **failed syncs**, and **void** conflicted events (no auto inventory mutation).

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  POS (browser)                                                           │
│  ┌──────────────────┐    ┌─────────────────────┐    ┌─────────────────┐ │
│  │ Complete sale    │───▶│ pos_event_queue      │───▶│ Sync engine     │ │
│  │ (always local)   │    │ (IndexedDB)          │    │ (oldest first)  │ │
│  └──────────────────┘    │ event_id, payload,   │    └────────┬────────┘ │
│                           │ status: PENDING/     │             │          │
│                           │   SYNCED/FAILED      │             │ POST     │
│                           └─────────────────────┘             │ Idempotency-Key
└─────────────────────────────────────────────────────────────────────────┼──┘
                                                                          │
                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Server                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ POST /api/transactions                                               ││
│  │ 1. If Idempotency-Key present → lookup transaction by key           ││
│  │    → if found: return 200 + existing (no second deduction)           ││
│  │ 2. If rejection exists (voided or not) → return 409                 ││
│  │ 3. Else: process_sale(..., idempotency_key)                          ││
│  │    → on success: store idempotency_key on transaction, return 200    ││
│  │    → on INSUFFICIENT_STOCK: record sync_rejection, return 409         ││
│  └─────────────────────────────────────────────────────────────────────┘│
│  DB: transactions.idempotency_key (unique), sync_rejections table        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Event flow

### 3.1 Sale completion (online or offline)

1. User completes payment on POS.
2. POS creates a **PosEvent**: `event_id` = new UUID, `type` = `SALE`, `payload` = full transaction body (same as POST /api/transactions), `status` = `PENDING`, plus `warehouse_id`, `store_id`, `pos_id`, `created_at`.
3. Event is **appended** to `pos_event_queue` (IndexedDB). Only `status` (and optionally `transaction_id`) is ever updated later.
4. UI shows **success immediately** (cart cleared, receipt). No wait for server.
5. Sync engine runs in the background (or on next app load / online event).

### 3.2 Sync engine (client)

1. **Triggers:** app load, `online` event, manual “Sync now”.
2. Reads all events with `status === 'PENDING'`, **oldest first**.
3. For each event: `POST /api/transactions` with body = `event.payload` and header `Idempotency-Key: event.event_id`.
4. **On 2xx:** mark event `SYNCED`, optionally store `transaction_id`.
5. **On 409:** mark event `FAILED` (e.g. INSUFFICIENT_STOCK or VOIDED). No silent failure; user sees pending/failed count.
6. **On network/5xx:** leave `PENDING`; will retry on next trigger (no double deduction because of idempotency).

### 3.3 Server reconciliation

1. **Idempotency:** If a transaction with the same `idempotency_key` already exists, return that transaction’s `id`. No second deduction, no second insert.
2. **Rejection check:** If this `idempotency_key` is in `sync_rejections` (e.g. previously failed with INSUFFICIENT_STOCK), return 409 with `code` (e.g. `INSUFFICIENT_STOCK` or `VOIDED`).
3. **Process:** Call `process_sale(..., idempotency_key)`. One atomic transaction: insert transaction (+ idempotency_key), items, deduct inventory, stock_movements. On insufficient stock, RPC raises; server records the rejection and returns 409.

---

## 4. Why inventory is safe

| Risk | Mitigation |
|------|------------|
| **Double deduction** | Every replay uses the same `event_id` as Idempotency-Key. Server either returns existing transaction (no deduction) or runs `process_sale` once. DB enforces unique `idempotency_key` on `transactions`. |
| **Silent data loss** | Events are append-only in IndexedDB. Status is only updated to SYNCED or FAILED. Failed events are visible (pending/failed count, admin list). |
| **Client overwrites server** | Server is the only writer to inventory. Client never sends “set quantity”; it only sends “this sale happened” (idempotent). |
| **Partial commit** | `process_sale` is one RPC: transaction + items + deductions + stock_movements in a single DB transaction. Either all succeed or none. |

---

## 5. Failure modes and recovery

| Scenario | Behaviour | Recovery |
|----------|-----------|----------|
| **Network off → sale → network on** | Event stays PENDING; sync runs on `online` (or “Sync now”). Server applies once; event marked SYNCED. | Automatic on reconnect or manual “Sync now”. |
| **App refresh mid-sync** | Some events SYNCED, some still PENDING. On next load, sync runs again. Replayed events get 200 (idempotent) and are marked SYNCED. | No double deduction; eventual consistency. |
| **Duplicate replay** | Same `event_id` sent twice. First: 200, transaction created. Second: 200, same transaction returned (idempotency lookup). | No second deduction. |
| **Insufficient stock at sync time** | Server returns 409, records row in `sync_rejections`. Client marks event FAILED. No deduction. | Admin sees “Failed syncs” on Dashboard; can void or restock and ask user to retry (new event would be new idempotency key if they re-ring). |
| **Admin voids rejection** | PATCH marks rejection as voided. If client retries same `event_id`, server returns 409 VOIDED. Client can mark FAILED; no deduction. | No inventory change; event not retried. |

---

## 6. Admin visibility

- **Dashboard (admin):** “Failed syncs (needs review)” card lists non-voided `sync_rejections` with reason, POS, time. **Void** marks the rejection so that replay returns 409 VOIDED (no inventory change).
- **POS:** Pending + failed count; “Sync now” when online. No silent failure.

---

## 7. Security and trust

- **Offline ≠ trusted.** Server validates every request (auth, scope, warehouse, stock). Idempotency prevents duplicate application; it does not bypass validation.
- **Idempotency is mandatory** for safe replay. All sync requests use `Idempotency-Key` (event_id).

---

## 8. Verification checklist

- [x] Network off → sale → network on: no double deduction; event syncs once.
- [x] App refresh mid-sync: no double deduction; eventual consistency.
- [x] Duplicate replay (same event_id): 200 with same transaction; no second deduction.
- [x] Two POS offline selling same SKU: each has distinct event_id; both sync when online; stock deducted once per sale. If one fails (e.g. insufficient stock), that event marked FAILED and visible to admin.

---

## 9. Files touched (summary)

- **Migration:** `inventory-server/supabase/migrations/20250209600000_phase4_offline_idempotency.sql` (idempotency_key, sync_rejections, process_sale 7-arg).
- **Server:** `lib/data/transactions.ts` (getTransactionByIdempotencyKey, processSale idempotencyKey), `lib/data/syncRejections.ts`, `app/api/transactions/route.ts` (idempotency + 409 handling), `app/api/sync-rejections/route.ts`, `app/api/sync-rejections/[id]/void/route.ts`.
- **Client:** `src/lib/posEventQueue.ts`, `src/lib/offlineSync.ts`, `src/lib/offlineDb.ts` (v2, pos_event_queue store), `src/contexts/POSContext.tsx` (enqueue + sync, syncNow), `src/pages/POS.tsx` (offline message, Sync now), `src/services/syncRejectionsApi.ts`, `src/components/dashboard/SyncRejectionsCard.tsx`, Dashboard (admin card).
