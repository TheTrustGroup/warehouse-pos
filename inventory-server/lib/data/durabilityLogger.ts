export interface DurabilityLogEntry {
  status: 'success' | 'failed';
  entity_type?: string;
  entity_id?: string;
  warehouse_id?: string;
  request_id?: string;
  user_role?: string;
  message?: string;
}

/** No-op durability logger. Replace with real logging/metrics when needed. */
export function logDurability(_entry: DurabilityLogEntry): void {
  // Optional: console.debug('[durability]', entry);
}
