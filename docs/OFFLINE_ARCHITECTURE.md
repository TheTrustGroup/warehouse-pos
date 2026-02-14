# Offline-First Architecture

This document explains how the Warehouse POS app handles data when the user is offline, how the sync queue works, and how conflicts are resolved. It is written for developers who need to understand or extend the system.

---

## Table of Contents

1. [Overview](#overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [IndexedDB Schema](#indexeddb-schema)
4. [Sync Queue Lifecycle](#sync-queue-lifecycle)
5. [Conflict Resolution](#conflict-resolution)
6. [Best Practices for Developers](#best-practices-for-developers)

---

## Overview

The app is **offline-first**: all create, update, and delete operations on products are applied **locally first** (IndexedDB), then queued for sync to the server when the network is available. Users can add, edit, and delete products without an internet connection; changes sync automatically (or on manual trigger) when back online.

### Key principles

- **Local-first**: The UI reads from and writes to IndexedDB. The server is not required for basic CRUD.
- **Queue-based sync**: Every mutation enqueues an operation (CREATE, UPDATE, DELETE) in a sync queue. A background process sends queue items to the API in order.
- **Conflict handling**: When the server has changed the same record (e.g. 409 Conflict), the app can auto-resolve (last-write-wins) or prompt the user via a conflict modal.
- **No user data loss**: Pending changes stay in IndexedDB until sync succeeds or the user explicitly clears failed items.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER ACTIONS                                    │
│  (Add product, Edit product, Delete product)                                │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOCAL LAYER (IndexedDB)                              │
│  ┌─────────────────┐    ┌──────────────────────────────────────────────┐    │
│  │    products     │    │              syncQueue                        │    │
│  │  (Dexie table)  │    │  { operation, tableName, data, status, ... } │    │
│  │                 │    │  • CREATE / UPDATE / DELETE                  │    │
│  │  • id (UUID)    │◄───┤  • status: pending → syncing → (deleted)      │    │
│  │  • syncStatus   │    │  • Order: by timestamp                       │    │
│  │  • serverId     │    └──────────────────────┬───────────────────────┘    │
│  └────────┬────────┘                             │                           │
└───────────┼──────────────────────────────────────┼───────────────────────────┘
            │                                      │
            │  UI reads products from IndexedDB    │  SyncService.processSyncQueue()
            │  (instant display)                    │  runs when online (auto 30s or manual)
            ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYNC LAYER (SyncService)                             │
│  • Picks pending items from syncQueue (oldest first)                         │
│  • For each: POST/PUT/DELETE to API_BASE_URL + /api/products                │
│  • On success: update product.serverId + syncStatus='synced', delete queue   │
│  • On 409: conflict resolution (last-write-wins or user choice)              │
│  • On 5xx/network error: retry with backoff (2^attempts s), max 5 attempts    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVER (API at API_BASE_URL)                         │
│  POST   /api/products        → create product (idempotency by client id)     │
│  PUT    /api/products/:id    → update product                                │
│  DELETE /api/products/:id   → delete product                                │
│  GET    /api/products/:id   → fetch current version (for conflict)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Example: Adding a product offline

1. User fills the product form and clicks **Add product**.
2. **inventoryDB.addProduct(data)** runs:
   - Generates a new UUID for the product.
   - Writes the product to the `products` table with `syncStatus: 'pending'`, `serverId: null`.
   - Appends a queue item `{ operation: 'CREATE', tableName: 'products', data: record, status: 'pending' }` to `syncQueue`.
3. The UI reads from IndexedDB, so the new product appears **immediately** in the list with a "pending" badge.
4. When the device is online, **SyncService.processSyncQueue()** runs (every 30 seconds or when the user goes back online):
   - Reads pending items from `syncQueue`.
   - Sends `POST /api/products` with the product payload and `Idempotency-Key: <client UUID>`.
   - On 200: updates the local product with `serverId` from the response and `syncStatus: 'synced'`, then deletes the queue item.
   - On 409: starts conflict resolution (see below).

---

## IndexedDB Schema

The app uses **Dexie.js** with two databases:

### 1. ExtremeDeptKidzDB (main app data)

| Table       | Key schema                          | Description |
|------------|--------------------------------------|-------------|
| **products** | `id` (UUID), indexes: `sku`, `syncStatus`, `updatedAt`, `lastModified` | Product records. `id` is client-generated; `serverId` is set after sync. |
| **syncQueue** | `++id` (auto-increment), indexes: `status`, `timestamp`, `attempts` | Pending/syncing/failed operations to send to the server. |
| **metadata** | `key`                                | Key-value store (e.g. conflict preference, sync errors, audit log). |

#### products (ProductRecord)

| Field        | Type           | Description |
|-------------|----------------|-------------|
| id          | string         | UUID, generated on the client. |
| name        | string         | Product name. |
| sku         | string         | SKU. |
| category    | string         | Category. |
| price       | number         | Price. |
| quantity    | number         | Quantity. |
| description | string (opt)   | Description. |
| images      | string[] (opt) | Image URLs. |
| createdAt   | string         | ISO date. |
| updatedAt   | string         | ISO date. |
| syncStatus  | 'synced' \| 'pending' \| 'error' | Sync state. |
| serverId    | string \| null | Server-assigned id after sync. |
| lastModified| number         | Unix timestamp (ms) for conflict comparison. |

#### syncQueue (SyncQueueItem)

| Field     | Type     | Description |
|----------|----------|-------------|
| id       | number   | Auto-increment (Dexie). |
| operation| 'CREATE' \| 'UPDATE' \| 'DELETE' | Operation type. |
| tableName| 'products' | Target table (only products currently). |
| data     | object   | Full record for the operation. |
| timestamp| number   | Unix ms; used for ordering. |
| attempts | number   | Retry count (max 5). |
| error    | string (opt) | Last error message. |
| status   | 'pending' \| 'syncing' \| 'failed' | Queue item state. |

### 2. WarehousePOSLogsDB (logging)

| Table      | Key schema           | Description |
|-----------|----------------------|-------------|
| **logs**    | `++id`, indexes: `level`, `category`, `timestamp` | App logs (DEBUG, INFO, WARN, ERROR); last 1000 kept. |
| **telemetry** | `key`              | Metrics (sync success/fail count, offline duration, conflict count). |

---

## Sync Queue Lifecycle

1. **pending** – Item is waiting to be sent. Ordered by `timestamp` (FIFO).
2. **syncing** – Temporarily set while the request is in flight (for UI).
3. **Success** – Queue item is **deleted**; product row is updated with `serverId` and `syncStatus: 'synced'`.
4. **Transient failure** (e.g. 5xx, network error) – `attempts` incremented, `status` set back to `pending`, exponential backoff (2^attempts seconds) before next try; max 5 attempts.
5. **Permanent failure** – After 5 attempts, `status` set to `failed`. Item remains in the queue; admin can clear failed items or retry single items from Settings → Admin & logs.

### Auto-sync

- When the app is online, **SyncService.startAutoSync()** runs **processSyncQueue()** every **30 seconds**.
- When the user goes from offline to online, **NetworkStatusContext** triggers a sync once.
- Manual sync is available from the sync status bar and from **Settings → Admin & logs**.

---

## Conflict Resolution

Conflicts occur when the same product was changed **both locally and on the server** (e.g. device A edited offline, device B edited online). The API returns **409 Conflict** for PUT.

### Strategies

1. **last_write_wins (automatic)**  
   If the user has set this in Settings, the app compares `localData.lastModified` (ms) with `serverData.updatedAt` (parsed to ms). The newer version is sent to the server (PUT with merged payload). No modal.

2. **User choice (ConflictModal)**  
   If not last-write-wins or server version is deleted:
   - **Keep local** – Re-create on server (POST) if server had deleted; else PUT local payload.
   - **Keep server** – Overwrite local product with server data, delete queue item.
   - **Merge** – User can merge fields; app sends merged payload via PUT.
   - **Server deleted** – User can choose "keep server" (delete local) or "keep local" (POST to re-create).

### Flow (409 received)

1. Fetch current server version: `GET /api/products/:id`. If 404, treat as "server deleted".
2. Read **conflict preference** from metadata (`last_write_wins` or null).
3. If preference is `last_write_wins` and server data exists: resolve with `handleConflict(local, server)` (compare timestamps), then `_applyConflictResolution` with merged payload.
4. Else if server deleted: show ConflictModal with `serverDeleted: true`; user picks keep local or keep server.
5. Else: show ConflictModal with local vs server; user picks keep_local, keep_server, or merge (with optional merged payload).
6. On resolve: update local DB and/or send PUT/POST, then delete queue item. On reject: put queue item back to `pending`.

---

## Best Practices for Developers

### When adding new entity types

- Add a new table in IndexedDB (e.g. `orders`) and a corresponding **tableName** in the sync queue (e.g. `'orders'`).
- In **SyncService**, extend `syncSingleItem` and `processSyncQueue` to handle the new table (API path, payload shape, success update).
- Use the same pattern: local write → enqueue CREATE/UPDATE/DELETE → process queue when online.

### When changing the API contract

- Keep **idempotency** for creates: send `Idempotency-Key: <client UUID>` so duplicate POSTs (e.g. retries) do not create duplicate records.
- Ensure the server returns the created resource **id** on POST so the client can set `serverId`.

### Testing offline behavior

- Use Chrome DevTools → Network → **Offline** (or throttle) to simulate no network.
- Add/edit/delete products, then go back online and confirm sync (see [OFFLINE_TESTING.md](../OFFLINE_TESTING.md) and [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

### Avoiding common mistakes

- **Do not** bypass the sync queue: always use `inventoryDB.addProduct`, `updateProduct`, `deleteProduct` (or equivalent for other entities) so that local DB and queue stay in sync.
- **Do not** assume the server is the source of truth for the current tab until sync has completed; the UI should read from IndexedDB and show pending/synced state.
- **Do** handle 409 in the API: return 409 when a conflict is detected so the client can run conflict resolution instead of overwriting silently.

---

## Related Files

| File | Purpose |
|------|---------|
| `src/db/inventoryDB.js` | IndexedDB schema, product and queue CRUD. |
| `src/services/syncService.js` | Queue processing, API calls, conflict resolution. |
| `src/hooks/useInventory.js` | React hook that uses IndexedDB + syncService. |
| `src/contexts/NetworkStatusContext.tsx` | Online/offline detection, triggers sync on reconnect. |
| `OFFLINE_TESTING.md` (repo root) | Manual and automated offline test scenarios. |
