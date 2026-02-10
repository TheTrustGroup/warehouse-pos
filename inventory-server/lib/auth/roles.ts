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

/** Role is derived from email: admin list (env) or email prefix (e.g. cashier@ → cashier). */
export function getRoleFromEmail(email: string): BackendRole {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return 'viewer';

  const adminEmails = getAdminEmails();
  if (adminEmails.has(normalized)) return 'admin';

  const local = normalized.split('@')[0]?.toLowerCase() ?? '';
  if (KNOWN_ROLES.includes(local as BackendRole)) return local as BackendRole;

  return 'viewer';
}

function getAdminEmails(): Set<string> {
  const raw = process.env.ALLOWED_ADMIN_EMAILS ?? process.env.VITE_SUPER_ADMIN_EMAILS ?? '';
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
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
