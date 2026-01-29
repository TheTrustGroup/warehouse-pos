/**
 * Default login format for role-based users (non-admin only).
 * Admin credentials are kept as you set them; these apply to manager, cashier, warehouse, driver, viewer.
 */
export const DEFAULT_USER_EMAIL_DOMAIN = 'extremedeptkidz.com';
export const DEFAULT_USER_PASSWORD = 'EDK-!@#';

/** Roles that use the shared email format and password (excludes admin) */
export const ROLES_WITH_SHARED_PASSWORD = ['manager', 'cashier', 'warehouse', 'driver', 'viewer'] as const;

/** Build email for a role: e.g. manager@extremedeptkidz.com */
export function emailForRole(roleId: string): string {
  return `${roleId}@${DEFAULT_USER_EMAIL_DOMAIN}`;
}
