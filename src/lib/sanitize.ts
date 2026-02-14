/**
 * Sanitize user-generated content before display to prevent XSS.
 * Use for any text that might be rendered as HTML. For rich HTML use a library like DOMPurify.
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
};

/**
 * Escape HTML special characters so the string is safe to use in text content or attributes.
 * Use when interpolating user input into DOM (e.g. element.textContent is safe; innerHTML is not).
 *
 * @param value - Raw string (e.g. from form input or API)
 * @returns Escaped string safe for display
 */
export function escapeHtml(value: string): string {
  if (typeof value !== 'string') return '';
  return String(value).replace(/[&<>"'/]/g, (c) => ENTITIES[c] ?? c);
}

/**
 * Strip HTML tags from a string (naive). For full sanitization of HTML use DOMPurify.
 *
 * @param value - String that may contain HTML
 * @returns Plain text with tags removed
 */
export function stripTags(value: string): string {
  if (typeof value !== 'string') return '';
  return String(value).replace(/<[^>]*>/g, '');
}
