/**
 * Request input validation for API routes.
 * Use to reject invalid ids before passing to DB and reduce injection surface.
 */

/** UUID v4 pattern (8-4-4-4-12 hex). */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Max length for id/warehouse_id (avoid DoS via huge strings). */
const MAX_ID_LENGTH = 64;

/**
 * Returns true if value looks like a valid UUID. Use for product id, warehouse_id when schema uses UUIDs.
 */
export function isValidUuid(value: string | null | undefined): boolean {
  if (value == null || typeof value !== 'string') return false;
  const t = value.trim();
  return t.length > 0 && t.length <= MAX_ID_LENGTH && UUID_REGEX.test(t);
}

/**
 * Returns true if value is a non-empty string with no control chars and within length. Use when IDs may be non-UUID.
 */
export function isValidId(value: string | null | undefined): boolean {
  if (value == null || typeof value !== 'string') return false;
  const t = value.trim();
  if (t.length === 0 || t.length > MAX_ID_LENGTH) return false;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 32 || c === 127) return false;
  }
  return true;
}
