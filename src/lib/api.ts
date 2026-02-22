/**
 * API configuration (Phase 5 stability — single source of truth for base URL).
 * All API calls must use API_BASE_URL from this module. No hardcoded domains in production.
 * Production build fails if VITE_API_BASE_URL is unset. Never show "Saved" without confirmed 2xx.
 */

/** Dev-only fallback when VITE_API_BASE_URL is unset. Production must never use fallback. */
const DEFAULT_API_BASE = import.meta.env.PROD ? '' : 'https://extremedeptkidz.com';
const _rawApiBase = import.meta.env.VITE_API_BASE_URL;
const _hasProdUrl = _rawApiBase != null && String(_rawApiBase).trim().length > 0;
if (import.meta.env.PROD && !_hasProdUrl) {
  throw new Error(
    '[API] VITE_API_BASE_URL is required in production. Set it in your hosting env (e.g. Vercel).'
  );
}
const _trimmed = (_hasProdUrl ? _rawApiBase : DEFAULT_API_BASE).replace(/\/$/, '');
// Must be a full URL (https://...) so fetch() hits the API host. If set without protocol, prepend https://.
const _resolved = _trimmed.startsWith('http://') || _trimmed.startsWith('https://') ? _trimmed : `https://${_trimmed}`;

/** Single source of truth for API base URL. All client requests must use this. */
export const API_BASE_URL = _resolved;
if (import.meta.env.DEV && _resolved === DEFAULT_API_BASE) {
  console.warn(
    '[API] VITE_API_BASE_URL is unset; using default. Set it in .env.local for your backend.'
  );
}

/**
 * Get authentication token from stored user session
 * 
 * Priority order:
 * 1. Check localStorage for explicit token (auth_token, access_token, or token)
 * 2. Check user object for token property (if stored after login)
 * 3. Return null (httpOnly cookies will be sent automatically by browser)
 * 
 * Note: In production with httpOnly cookies, the token is automatically
 * included in requests by the browser, so this function may return null
 * and the Authorization header won't be needed.
 */
export function getAuthToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // First, check for explicit token storage (common patterns)
    const authToken = localStorage.getItem('auth_token') || 
                     localStorage.getItem('access_token') || 
                     localStorage.getItem('token');
    
    if (authToken) {
      // If token doesn't start with "Bearer ", add it
      return authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }
    
    // Check user object for token property (if backend returns token in user object)
    const stored = localStorage.getItem('current_user');
    if (stored) {
      const user = JSON.parse(stored);
      
      // Check if user object has a token property
      if (user?.token) {
        return user.token.startsWith('Bearer ') ? user.token : `Bearer ${user.token}`;
      }
      
      // Check if user object has an accessToken property
      if (user?.accessToken) {
        return user.accessToken.startsWith('Bearer ') ? user.accessToken : `Bearer ${user.accessToken}`;
      }
    }
    
    // No token found - httpOnly cookies will be sent automatically if configured
    return null;
  } catch (error) {
    console.error('Error retrieving auth token:', error);
    return null;
  }
}

/**
 * Create headers for API requests
 * 
 * Note: If using httpOnly cookies for authentication, the Authorization
 * header may not be needed as cookies are sent automatically by the browser.
 * However, if your backend uses Bearer tokens, this will include them.
 */
export function getApiHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  // Only add Authorization header if token is available
  // If using httpOnly cookies, token will be null and cookies will be sent automatically
  if (token) {
    headers['Authorization'] = token;
  }
  
  return headers;
}

/**
 * API response handler with error checking
 */
export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ 
      message: `HTTP ${response.status}: ${response.statusText}` 
    }));
    throw new Error(errorData.message || 'API request failed');
  }
  
  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  
  return null as T;
}
