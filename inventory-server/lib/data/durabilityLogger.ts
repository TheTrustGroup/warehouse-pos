/**
 * Durability/audit logging for mutations.
 * Stub: logs to console; replace with real persistence (e.g. DB table) when needed.
 */

export interface DurabilityLogEntry {
  status: 'success' | 'failed';
  entity_type: string;
  entity_id: string;
  warehouse_id?: string;
  request_id?: string;
  user_role?: string;
  message?: string;
}

export function logDurability(entry: DurabilityLogEntry): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console -- intentional dev-only audit log
    console.info('[durability]', entry);
  }
  // TODO: persist to audit table when required
}
