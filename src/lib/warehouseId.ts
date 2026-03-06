/**
 * Warehouse ID validation — prevent API calls with placeholder or unloaded IDs.
 * Used by Dashboard, POS, Sales, Deliveries, and WarehouseContext.
 */

export const PLACEHOLDER_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';
const NULL_UUID = '00000000-0000-0000-0000-000000000000';

export function isValidWarehouseId(id: string | null | undefined): boolean {
  return (
    id != null &&
    id !== '' &&
    id !== PLACEHOLDER_WAREHOUSE_ID &&
    id !== NULL_UUID
  );
}
