# Phase 2 — Warehouse ID resolution

Run these in **Supabase SQL Editor** to confirm every user has the correct warehouse in `user_scopes` before relying on the new WarehouseGuard.

## Step 2A — Verify user_scopes

**Run the query in `docs/PHASE2_VERIFY_USER_SCOPES.sql`** in the Supabase SQL Editor. Copy only the contents of that file (no markdown) so you don’t get a syntax error.

- Confirm every user who should have access has at least one row in `user_scopes` with the **correct** `warehouse_id`.
- If a user has the wrong scope (e.g. Main Town user pointing to Main Store), run an UPDATE in the SQL Editor, for example:

  `UPDATE user_scopes SET warehouse_id = '312ee60a-9bcb-4a5f-b6ae-59393f716867' WHERE user_email = 'maintown_cashier@extremedeptkidz.com';`

- If a user has **no** row in `user_scopes`, add one (run in SQL Editor):

  `INSERT INTO user_scopes (user_email, warehouse_id) VALUES ('user@example.com', '00000000-0000-0000-0000-000000000001');`

**Note:** This project uses `user_email` (not `user_id`) in `user_scopes`. The backend resolves scope by email via `getScopeForUser(auth.email)`.

## Step 2D — Wrap authenticated routes with WarehouseGuard

Use **WarehouseGuard** (or **AuthenticatedLayout**) so warehouse is resolved before any dashboard/inventory/POS content. The guard shows "Loading warehouse...", then either your app content or "Could not load warehouse" with a Retry button.

### Option A — Wrap route elements directly

In your `App.tsx` (or wherever you define protected routes), wrap the authenticated route branch with `WarehouseGuard`:

```tsx
import { WarehouseGuard } from './components/WarehouseGuard';

// Example with React Router:
<Route element={<ProtectedRoute />}>
  <Route element={<WarehouseGuard />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/inventory" element={<InventoryPage />} />
    <Route path="/pos" element={<POSPage />} />
    <Route path="/sales" element={<SalesHistoryPage />} />
    <Route path="/deliveries" element={<DeliveriesPage />} />
    <Route path="/reports" element={<ReportsPage />} />
    <Route path="/users" element={<UserManagement />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Route>
</Route>
```

If your router uses a layout route with `<Outlet />`:

```tsx
// Layout route that wraps all authenticated pages:
function AuthenticatedLayout() {
  return (
    <WarehouseGuard>
      <Outlet />
    </WarehouseGuard>
  );
}

<Route element={<ProtectedRoute />}>
  <Route element={<AuthenticatedLayout />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/inventory" element={<InventoryPage />} />
    {/* ... rest */}
  </Route>
</Route>
```

### Option B — Use AuthenticatedLayout component

Import the provided layout (it just wraps children with `WarehouseGuard`):

```tsx
import { AuthenticatedLayout } from './components/AuthenticatedLayout';

<Route element={<ProtectedRoute />}>
  <Route element={<AuthenticatedLayout />}>
    <Route path="/" element={<DashboardPage />} />
    {/* ... */}
  </Route>
</Route>
```

Ensure **WarehouseProvider** (and **AuthProvider**) wrap the app above any route that uses WarehouseGuard, so `useCurrentWarehouse()` and `useWarehouse()` have context.

- Current font, size, icons, brand name, logo, and color system are preserved (Barlow Condensed, `--edk-*`, primary red #E8281A).
