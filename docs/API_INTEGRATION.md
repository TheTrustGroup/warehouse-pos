# API Integration Guide

This document describes the HTTP API that the Warehouse POS frontend expects from the backend. Use it to implement or integrate with the inventory, auth, and orders APIs.

---

## Table of Contents

1. [Base URL and Configuration](#base-url-and-configuration)
2. [Authentication](#authentication)
3. [Required Endpoints](#required-endpoints)
4. [Request / Response Formats](#request--response-formats)
5. [Error Codes and Handling](#error-codes-and-handling)
6. [Rate Limiting and Resilience](#rate-limiting-and-resilience)

---

## Base URL and Configuration

- The frontend uses **one base URL** for all API calls: `VITE_API_BASE_URL` (e.g. `https://api.yourstore.com`).
- No trailing slash. All paths start with `/` (e.g. `/api/products`).
- **CORS**: The backend must allow the frontend origin and credentials if using cookies.
- **Same backend for all clients**: Warehouse UI and storefront must use the same API base URL so they share one source of truth.

**Example (.env.local):**

```bash
VITE_API_BASE_URL=https://api.yourstore.com
```

---

## Authentication

The app supports two patterns:

1. **Bearer token** – Stored in `localStorage` (`auth_token`, `access_token`, or `token`). Sent as `Authorization: Bearer <token>`.
2. **HTTP-only cookies** – No token in JS; browser sends cookies automatically. `getAuthToken()` may return `null`; requests still include credentials.

### Auth endpoints (try in order)

| Purpose | Primary | Fallback (on 404/403) |
|--------|---------|------------------------|
| Login  | `POST /admin/api/login` | `POST /api/auth/login` |
| Session / current user | `GET /admin/api/me` | `GET /api/auth/user` |
| Logout | `POST /admin/api/logout` | `POST /api/auth/logout` |

**Login request body:**

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

**Session response (expected shape):**

- User object with at least: `id`, `email`, `role` (e.g. `admin`, `manager`, `cashier`).
- Optional: `token` or `accessToken` for Bearer usage.
- Frontend stores user (and optionally token) and uses it for subsequent requests.

**Headers sent by the client:**

- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer <token>` (if token is available)
- `Idempotency-Key: <uuid>` (for POST create; see Products below)
- `x-request-id` (same-origin only, for tracing)

---

## Required Endpoints

### Health

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | No (optional) | Liveness; used for "server reachable" and circuit breaker. |
| GET | `/api/ping` | No (optional) | Alternative health check. |

- **Response:** 200 OK (body optional). Non-2xx is treated as unhealthy.

---

### Products (inventory)

Used for list, create, update, delete, and sync. The app tries **/api/products** first; some flows fall back to **/admin/api/products** on 404.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/products` or `/admin/api/products` | Yes | List products. Supports `limit`, `offset` (or equivalent). |
| GET | `/api/products/:id` or `/admin/api/products/:id` | Yes | Get one product (e.g. for conflict resolution). |
| POST | `/api/products` or `/admin/api/products` | Yes | Create product. **Idempotency-Key** = client UUID. |
| PUT | `/api/products/:id` | Yes | Update product. Return **409** on conflict. |
| DELETE | `/api/products/:id` | Yes | Delete product. Return 204 or 200. |

**Query params (list):**

- `limit` (e.g. 1000)
- `offset` (optional)

**List response** (one of):

- `{ "data": Product[], "total": number }`
- Or a bare array `Product[]`

**Product payload (create/update):**

```json
{
  "id": "uuid-from-client",
  "name": "Product name",
  "sku": "SKU-001",
  "category": "Toys",
  "quantity": 10,
  "sellingPrice": 19.99,
  "costPrice": 12.00,
  "description": "",
  "images": [],
  "barcode": "",
  "tags": [],
  "reorderLevel": 0,
  "location": { "warehouse": "", "aisle": "", "rack": "", "bin": "" },
  "supplier": { "name": "", "contact": "", "email": "" },
  "expiryDate": null,
  "createdBy": "admin",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Create response:** 200/201 with the created product object; must include **id** (server id) so the client can set `serverId` locally.

**Conflict (update):** When the server detects a conflict (e.g. version mismatch), return **409 Conflict** so the client can run conflict resolution (last-write-wins or user choice).

---

### Size codes (optional)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/size-codes` | Yes | List size code options for product form. |

**Response:** `{ "data": [ { "size_code": "...", "size_label": "...", "size_order": number } ] }`.

---

### Orders

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/orders` | Yes | List orders. |
| POST | `/api/orders` | Yes | Create order. |
| PATCH | `/api/orders/:id` | Yes | Update order (e.g. status). |
| PATCH | `/api/orders/:id/assign-driver` | Yes | Assign driver. |
| PATCH | `/api/orders/:id/deliver` | Yes | Mark delivered. |
| PATCH | `/api/orders/:id/fail` | Yes | Mark failed. |
| PATCH | `/api/orders/:id/cancel` | Yes | Cancel order. |
| POST | `/api/orders/deduct` | Yes | Deduct inventory for order. |
| POST | `/api/orders/return-stock` | Yes | Return stock. |

---

### Warehouses & stores

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/warehouses` | Yes | List warehouses. |
| GET | `/api/warehouses?store_id=:id` | Yes | Warehouses for a store. |
| GET | `/api/stores` | Yes | List stores. |

---

### User scopes (admin)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/user-scopes?email=...` | Yes | Get scopes for user. |
| PUT | `/api/user-scopes` | Yes | Set user scopes. |

---

### Sync rejections (optional)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/sync-rejections?...` | Yes | List sync rejections. |
| PATCH | `/api/sync-rejections/:id/void` | Yes | Void a rejection. |

---

### Transactions (optional)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/transactions` | Yes | List transactions (admin). |
| POST | `/api/transactions` | Yes | Create transaction. |

---

## Request / Response Formats

- **Request body:** JSON. `Content-Type: application/json`.
- **Response body:** JSON for most endpoints. `Accept: application/json`.
- **Empty body:** 204 No Content or 200 with `null`/empty body are acceptable where appropriate.
- **Errors:** JSON body with a `message` (or similar) is used for user-facing messages when possible.

**Example error body:**

```json
{
  "message": "Product not found",
  "code": "NOT_FOUND"
}
```

---

## Error Codes and Handling

| Code | Meaning | Client behavior |
|------|--------|------------------|
| 200 / 201 | Success | Use response body; for POST product, set local `serverId` from response `id`. |
| 204 | No content | Treat as success. |
| 400 | Bad request | Show validation message; do not retry same payload. |
| 401 | Unauthorized | Clear session, redirect to login; optional re-auth. |
| 403 | Forbidden | Show "no permission"; try fallback route if applicable (e.g. /api/products vs /admin/api/products). |
| 404 | Not found | For GET product: treat as "server deleted" in conflict flow. For list: may try fallback path. |
| 409 | Conflict | Trigger conflict resolution (last-write-wins or ConflictModal). |
| 408, 429, 500, 502, 503, 504 | Transient | Retry with backoff (client uses exponential backoff and circuit breaker). |

The frontend **apiClient** retries GET and, for POST/PUT, only retries on transient statuses (e.g. 5xx, 429). It uses a **circuit breaker** so that after repeated failures, requests are short-circuited with a "server temporarily unavailable" message until the circuit closes.

---

## Rate Limiting and Resilience

- **Timeout:** Default request timeout is **25 seconds** (configurable via `timeoutMs`).
- **Retries:** Up to 3 attempts with exponential backoff for retryable methods/statuses.
- **Idempotency:** Product create sends **Idempotency-Key** (client UUID) so retries do not create duplicates.
- **Rate limiting:** If the API returns **429 Too Many Requests**, the client retries after backoff. Include `Retry-After` in the response when possible.
- **Circuit breaker:** After multiple failures, the client stops sending requests for a period to avoid hammering the server; health checks can be used to recover.

---

## Example: Minimal product API

```http
POST /api/products HTTP/1.1
Host: api.yourstore.com
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Widget",
  "sku": "WID-01",
  "category": "Toys",
  "quantity": 10,
  "sellingPrice": 9.99,
  "costPrice": 5.00,
  "description": "",
  "images": [],
  "barcode": "",
  "tags": [],
  "reorderLevel": 0,
  "location": { "warehouse": "", "aisle": "", "rack": "", "bin": "" },
  "supplier": { "name": "", "contact": "", "email": "" },
  "expiryDate": null,
  "createdBy": "admin",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Response (201 Created):**

```json
{
  "id": "server-generated-id-123",
  "name": "Widget",
  "sku": "WID-01",
  "category": "Toys",
  "quantity": 10,
  "sellingPrice": 9.99,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

The client stores `server-generated-id-123` as `serverId` for that product and marks it as synced.

---

## Related Files

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Base URL, auth token, headers. |
| `src/lib/apiClient.ts` | apiRequest, retries, circuit breaker, apiGet/apiPost/apiPut/apiDelete. |
| `src/services/syncService.js` | Product sync: POST/PUT/DELETE to /api/products. |
| `src/contexts/AuthContext.tsx` | Login, session, logout. |
| `src/contexts/InventoryContext.tsx` | Load/save products (API + IndexedDB). |
