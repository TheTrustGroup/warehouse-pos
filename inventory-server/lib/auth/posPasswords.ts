/**
 * POS password enforcement: only the configured password works for each POS account.
 * Prevents theft — no other password is accepted for these emails.
 */

import { timingSafeEqual } from 'crypto';

const POS_CASHIER_MAIN_STORE_EMAIL = 'cashier@extremedeptkidz.com';
const POS_MAIN_TOWN_EMAIL = 'maintown_cashier@extremedeptkidz.com';

/** Env keys for POS passwords (set in .env / Vercel). */
export const POS_PASSWORD_ENV_KEYS = {
  [POS_CASHIER_MAIN_STORE_EMAIL]: 'POS_PASSWORD_CASHIER_MAIN_STORE',
  [POS_MAIN_TOWN_EMAIL]: 'POS_PASSWORD_MAIN_TOWN',
} as const;

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  if (bufA.length === 0) return true;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Returns true if this email is a POS account that requires password check.
 */
export function isPosRestrictedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized === POS_CASHIER_MAIN_STORE_EMAIL || normalized === POS_MAIN_TOWN_EMAIL;
}

/**
 * Verify password for a POS account. Only the configured env password is accepted.
 * Returns true if login is allowed, false if wrong password or env not set.
 */
export function verifyPosPassword(email: string, password: string): boolean {
  const normalized = email.trim().toLowerCase();
  const envKey = POS_PASSWORD_ENV_KEYS[normalized as keyof typeof POS_PASSWORD_ENV_KEYS];
  if (!envKey) return true; // not a POS-restricted account; caller may allow

  const expected = process.env[envKey];
  if (!expected || typeof expected !== 'string') return false;
  return timingSafeCompare(password, expected.trim());
}
