/**
 * RBAC — Role responsibilities (backend authority).
 * UI hides by permission; backend MUST enforce. Never trust client for role.
 *
 * ADMIN:
 *   Full access: inventory CRUD, user management, settings, reports, POS, orders.
 *
 * CASHIER (Sales Person):
 *   POS access only: view products, create sales, view/update orders (own scope).
 *   NO access: users, settings, reports, inventory editing, dashboard, bulk actions.
 *
 * Other roles (manager, warehouse, driver, viewer) — see frontend types/permissions.ts.
 * Backend derives role from trusted server data only (session after login), not from request body.
 */

export type BackendRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'warehouse'
  | 'driver'
  | 'viewer';

const KNOWN_ROLES: BackendRole[] = [
  'super_admin',
  'admin',
  'manager',
  'cashier',
  'warehouse',
  'driver',
  'viewer',
];

/**
 * Role is derived from email: admin list (env) or email local part.
 * Local part can be:
 * - Exactly the role (cashier@...)
 * - role_place (cashier_maintown → cashier)
 * - place_role (maintown_cashier → cashier)
 * so both POS users can have the same cashier role with different emails (e.g. cashier@, cashier_maintown@, maintown_cashier@).
 */
export function getRoleFromEmail(email: string): BackendRole {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return 'viewer';

  const adminEmails = getAdminEmails();
  if (adminEmails.has(normalized)) return 'admin';

  const local = normalized.split('@')[0]?.toLowerCase() ?? '';
  if (KNOWN_ROLES.includes(local as BackendRole)) return local as BackendRole;
  const parts = local.split('_').filter(Boolean);
  if (parts.length >= 2) {
    const prefix = parts[0];
    const suffix = parts[parts.length - 1];
    if (KNOWN_ROLES.includes(prefix as BackendRole)) return prefix as BackendRole;
    if (KNOWN_ROLES.includes(suffix as BackendRole)) return suffix as BackendRole;
  }

  return 'viewer';
}

/** Default admin email so admin login works even when env is not set. Keep admin credentials unchanged. */
const DEFAULT_ADMIN_EMAIL = 'info@extremedeptkidz.com';

function getAdminEmails(): Set<string> {
  const raw = process.env.ALLOWED_ADMIN_EMAILS ?? process.env.VITE_SUPER_ADMIN_EMAILS ?? '';
  const fromEnv = raw && typeof raw === 'string'
    ? raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  const set = new Set(fromEnv);
  if (set.size === 0) set.add(DEFAULT_ADMIN_EMAIL);
  return set;
}

export function isAdmin(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** Can use POS: create sales, deduct inventory, create transactions. */
export function canAccessPos(role: string): boolean {
  return ['admin', 'super_admin', 'manager', 'cashier'].includes(role);
}

/** Can deduct or return stock (orders): POS roles + warehouse. Admins retain full access. */
export function canWarehouseDeductOrReturn(role: string): boolean {
  return ['admin', 'super_admin', 'manager', 'cashier', 'warehouse'].includes(role);
}
