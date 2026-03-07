/**
 * Warehouse ID validation — prevent API calls with unloaded/empty IDs.
 * Used by Dashboard, POS, Sales, Deliveries, and WarehouseContext.
 * Phase 8: No sentinel or placeholder constants; use actual UUID from API only.
 */
const NULL_UUID = '00000000-0000-0000-0000-000000000000';

export function isValidWarehouseId(id: string | null | undefined): boolean {
  return (
    id != null &&
    id !== '' &&
    id !== NULL_UUID
  );
}
