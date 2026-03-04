/**
 * Validate email + password against env (ALLOWED_ADMIN_EMAILS, POS_PASSWORD_*).
 * Used by POST /api/auth/login and POST /admin/api/login.
 */

const ADMIN_EMAILS_ENV = 'ALLOWED_ADMIN_EMAILS';
const FALLBACK_ADMIN_EMAIL = 'info@extremedeptkidz.com';

const POS_EMAIL_MAIN_STORE = 'cashier@extremedeptkidz.com';
const POS_EMAIL_MAIN_TOWN = 'maintown_cashier@extremedeptkidz.com';
const POS_PASSWORD_MAIN_STORE_ENV = 'POS_PASSWORD_CASHIER_MAIN_STORE';
const POS_PASSWORD_MAIN_TOWN_ENV = 'POS_PASSWORD_MAIN_TOWN';

/** Optional: when set, admin logins must match this password. When unset, any password accepted for admin (dev-friendly). */
const ADMIN_PASSWORD_ENV = 'ADMIN_PASSWORD';

function getAdminEmails(): Set<string> {
  const raw = process.env[ADMIN_EMAILS_ENV]?.trim();
  const list = raw ? raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) : [];
  if (list.length === 0) return new Set([FALLBACK_ADMIN_EMAIL.toLowerCase()]);
  return new Set(list);
}

export interface ValidatedUser {
  email: string;
  role: 'admin' | 'super_admin' | 'cashier';
}

/**
 * Validate credentials. Returns user info or throws Error with message suitable for 401 response.
 */
export function validateCredentials(email: string, password: string): ValidatedUser {
  const trimmedEmail = email?.trim().toLowerCase() ?? '';
  const trimmedPassword = password?.trim() ?? '';
  if (!trimmedEmail || !trimmedPassword) {
    throw new Error('Invalid email or password');
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.has(trimmedEmail)) {
    const adminPassword = process.env[ADMIN_PASSWORD_ENV]?.trim();
    if (adminPassword && adminPassword !== trimmedPassword) {
      throw new Error('Invalid email or password');
    }
    return { email: trimmedEmail, role: 'admin' };
  }

  if (trimmedEmail === POS_EMAIL_MAIN_STORE) {
    const expected = process.env[POS_PASSWORD_MAIN_STORE_ENV]?.trim();
    if (!expected || expected !== trimmedPassword) throw new Error('Invalid email or password');
    return { email: trimmedEmail, role: 'cashier' };
  }
  if (trimmedEmail === POS_EMAIL_MAIN_TOWN) {
    const expected = process.env[POS_PASSWORD_MAIN_TOWN_ENV]?.trim();
    if (!expected || expected !== trimmedPassword) throw new Error('Invalid email or password');
    return { email: trimmedEmail, role: 'cashier' };
  }

  throw new Error('Invalid email or password');
}
