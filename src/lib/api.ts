/**
 * API configuration and utilities
 */

// Get API base URL from environment variable or use default
// Must match admin panel origin (e.g. https://extremedeptkidz.com) for /admin/api/* to work
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://extremedeptkidz.com').replace(/\/$/, '');

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
