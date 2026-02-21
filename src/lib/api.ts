/**
 * API client config — used by InventoryPage, AuthContext, and other API callers.
 * API_BASE_URL is the single source of truth so fetch always hits the right host.
 */
const DEFAULT_API_BASE_URL = 'https://warehouse-pos-api-v2.vercel.app';

export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
    ? import.meta.env.VITE_API_BASE_URL
    : DEFAULT_API_BASE_URL;

export function getApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** Parse JSON from a Response; used by AuthContext and others. */
export async function handleApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}
