/** Role helpers for session. */

export function isAdmin(role: string): boolean {
  return role?.toLowerCase() === 'admin';
}
