/**
 * Warehouse ID validation — prevent API calls with unloaded/empty IDs.
 * Used by Dashboard, POS, Sales, Deliveries, and WarehouseContext.
 *
 * Note: 00000000-0000-0000-0000-000000000001 (PLACEHOLDER_WAREHOUSE_ID) is not rejected here:
 * in production it is often the real id for "Main Store". We avoid using it as a default
 * by initializing context to '' and only setting currentWarehouseId from /api/warehouses.
 */
export const PLACEHOLDER_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';
const NULL_UUID = '00000000-0000-0000-0000-000000000000';

export function isValidWarehouseId(id: string | null | undefined): boolean {
  return (
    id != null &&
    id !== '' &&
    id !== NULL_UUID
  );
}
