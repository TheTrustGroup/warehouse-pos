/**
 * API configuration (Phase 5 stability — single source of truth for base URL).
 * All API calls must use API_BASE_URL from this module. No hardcoded domains in production.
 * - Same-origin (one Vercel project): set VITE_API_BASE_URL="" so fetch('/api/...') is used.
 * - Cross-origin: set VITE_API_BASE_URL to the API origin (e.g. https://api.example.com).
 */

/** Dev-only fallback when VITE_API_BASE_URL is unset. */
const DEFAULT_API_BASE = import.meta.env.PROD ? '' : 'https://extremedeptkidz.com';
const _rawApiBase = import.meta.env.VITE_API_BASE_URL;
const _isSet = _rawApiBase !== undefined && _rawApiBase !== null;
if (import.meta.env.PROD && !_isSet) {
  throw new Error(
    '[API] VITE_API_BASE_URL is required in production. Use "" for same-origin or the API URL for cross-origin (e.g. in Vercel env).'
  );
}
const _trimmed = (_isSet ? String(_rawApiBase).replace(/\/$/, '') : DEFAULT_API_BASE).trim();
// Empty string = same-origin (relative URLs). Otherwise full URL; if no protocol, prepend https.
const _resolved =
  _trimmed === ''
    ? ''
    : _trimmed.startsWith('http://') || _trimmed.startsWith('https://')
      ? _trimmed
      : `https://${_trimmed}`;

// In production, validate non-empty base URL is a valid absolute URL (P3#18).
if (import.meta.env.PROD && _resolved !== '') {
  try {
    new URL(_resolved);
  } catch {
    throw new Error(
      '[API] VITE_API_BASE_URL must be a valid URL or empty for same-origin. Current value is invalid.'
    );
  }
}

/** Single source of truth for API base URL. "" = same-origin (relative /api/...). */
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
  
  if (token) headers['Authorization'] = token;
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
