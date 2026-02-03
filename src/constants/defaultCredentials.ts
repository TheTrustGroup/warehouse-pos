/**
 * Default login format for role-based users (non-admin only).
 * Admin credentials are kept as you set them; these apply to manager, cashier, warehouse, driver, viewer.
 * In production, default password is never exposed in UI or client bundle.
 */
export const DEFAULT_USER_EMAIL_DOMAIN = 'extremedeptkidz.com';

/** Only available in development; production must use backend/env for defaults. */
function getDefaultPasswordDev(): string {
  return 'EDK-!@#';
}

/** Safe access: never expose default password in production. Use for forms/display only in dev. */
export function getDefaultUserPassword(): string {
  if (import.meta.env.PROD) return '';
  return getDefaultPasswordDev();
}

/** Roles that use the shared email format and password (excludes admin) */
export const ROLES_WITH_SHARED_PASSWORD = ['manager', 'cashier', 'warehouse', 'driver', 'viewer'] as const;

/** Build email for a role: e.g. manager@extremedeptkidz.com */
export function emailForRole(roleId: string): string {
  return `${roleId}@${DEFAULT_USER_EMAIL_DOMAIN}`;
}
