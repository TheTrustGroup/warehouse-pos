/**
 * Phase 2: Layout for all authenticated routes.
 * Renders WarehouseGuard so warehouse is resolved before any dashboard/inventory/POS content.
 * Use as the layout route element: <Route element={<AuthenticatedLayout />}> with nested routes.
 * Nested routes render via <Outlet /> inside the guard.
 */
import { Outlet } from 'react-router-dom';
import { WarehouseGuard } from './WarehouseGuard';

export function AuthenticatedLayout() {
  return (
    <WarehouseGuard>
      <Outlet />
    </WarehouseGuard>
  );
}
