/**
 * Warehouse ID validation — prevent API calls with unloaded/empty IDs.
 * Used by Dashboard, POS, Sales, Deliveries, and WarehouseContext.
 * No sentinel or placeholder: only real UUIDs from API/auth.
 */
const NULL_UUID = '00000000-0000-0000-0000-000000000000';
/** Placeholder/sentinel warehouse ID — never use for API calls. */
const PLACEHOLDER_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';

export function isValidWarehouseId(id: string | null | undefined): boolean {
  return (
    id != null &&
    id !== '' &&
    id !== NULL_UUID &&
    id !== PLACEHOLDER_WAREHOUSE_ID
  );
}
