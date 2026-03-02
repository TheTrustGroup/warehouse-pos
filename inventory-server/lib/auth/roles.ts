/** Role helpers for session. */

export function isAdmin(role: string): boolean {
  const r = role?.toLowerCase();
  return r === 'admin' || r === 'super_admin';
}
