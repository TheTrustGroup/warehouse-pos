/**
 * Structured logging for inventory/product saves. No PII exposure; non-blocking.
 * Format: [INVENTORY_SAVE] status entity_type entity_id warehouse_id request_id (user hash or role only).
 */

export type EntityType = 'product' | 'inventory';

export interface DurabilityLogPayload {
  status: 'success' | 'failed';
  entity_type: EntityType;
  entity_id: string;
  warehouse_id?: string;
  /** Request correlation ID (e.g. x-request-id or generated). */
  request_id?: string;
  /** Optional: role or anonymized identifier only; never raw email in logs. */
  user_role?: string;
  /** Error message when status === 'failed' (no stack in prod). */
  message?: string;
}

function safeString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 256);
  return String(v).slice(0, 256);
}

export function logDurability(payload: DurabilityLogPayload): void {
  try {
    const line = [
      '[INVENTORY_SAVE]',
      `status=${payload.status}`,
      `entity_type=${payload.entity_type}`,
      `entity_id=${safeString(payload.entity_id)}`,
      payload.warehouse_id != null ? `warehouse_id=${safeString(payload.warehouse_id)}` : '',
      payload.request_id != null ? `request_id=${safeString(payload.request_id)}` : '',
      payload.user_role != null ? `user_role=${safeString(payload.user_role)}` : '',
      payload.status === 'failed' && payload.message != null ? `message=${safeString(payload.message)}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    console.error(line);
  } catch {
    // Never let logging break the request
  }
}
