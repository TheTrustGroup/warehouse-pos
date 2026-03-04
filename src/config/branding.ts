/**
 * Single source of truth for app brand name and UI copy.
 * Use this in receipts, share text, and any in-app brand strings.
 *
 * Also keep in sync (manually):
 * - index.html: <title>, meta name="description"
 * - public/manifest.json: "name", "short_name", "description"
 */

export const BRAND = {
  appName: 'Extreme Dept Kidz',
  appSubtitle: 'Inventory & POS',
  /** Used in receipt header and share sheet. */
  receiptTitle: 'Extreme Dept Kidz',
} as const;
