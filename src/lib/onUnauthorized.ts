/**
 * Central handler for 401 Unauthorized from the API.
 * When the backend returns 401, we clear session storage and notify the app so the user is redirected to login.
 * AuthProvider registers the handler; apiClient invokes it on 401.
 */

let handler: (() => void) | null = null;

export function setOnUnauthorized(fn: (() => void) | null): void {
  handler = fn;
}

export function onUnauthorized(): void {
  if (typeof handler === 'function') handler();
}

export function clearSessionStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('current_user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('user_role');
      sessionStorage.removeItem('user_email');
    }
  } catch {
    // ignore
  }
}
