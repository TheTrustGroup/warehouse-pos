/**
 * Centralized API Service
 * Handles all API calls with authentication, CSRF protection, and error handling
 */

import { Product, Transaction } from '../types';
import { Order } from '../types/order';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://extremedeptkidz.com/api';

/**
 * Get authentication token from various storage locations
 */
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token') || 
         sessionStorage.getItem('auth_token') ||
         getCookie('auth_token') ||
         getCookie('laravel_token');
}

/**
 * Get CSRF token (for Laravel/Symfony frameworks)
 */
function getCsrfToken(): string | null {
  return getCookie('XSRF-TOKEN') || 
         (document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || null);
}

/**
 * Helper function to get cookie value
 */
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Base fetch wrapper with authentication and error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // Add authorization token if available
  if (token) {
    headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Add CSRF token if available (for Laravel/Symfony)
  if (csrfToken) {
    headers['X-CSRF-TOKEN'] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 Unauthorized - redirect to login
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    sessionStorage.removeItem('auth_token');
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  // Handle non-OK responses
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: `HTTP ${response.status}: ${response.statusText}`
    }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }

  return null as T;
}

/**
 * Centralized API service with all endpoints
 */
export const api = {
  // Products API
  products: {
    getAll: (): Promise<Product[]> => apiFetch<Product[]>('/products'),
    
    getOne: (id: string): Promise<Product> => apiFetch<Product>(`/products/${id}`),
    
    create: (data: Partial<Product>): Promise<Product> => 
      apiFetch<Product>('/products', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    update: (id: string, data: Partial<Product>): Promise<Product> =>
      apiFetch<Product>(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    
    delete: (id: string): Promise<void> =>
      apiFetch<void>(`/products/${id}`, {
        method: 'DELETE',
      }),
  },

  // Orders API
  orders: {
    getAll: (): Promise<Order[]> => apiFetch<Order[]>('/orders'),
    
    getOne: (id: string): Promise<Order> => apiFetch<Order>(`/orders/${id}`),
    
    create: (data: Partial<Order>): Promise<Order> =>
      apiFetch<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    update: (id: string, data: Partial<Order>): Promise<Order> =>
      apiFetch<Order>(`/orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    
    updateStatus: (id: string, status: string, notes?: string): Promise<Order> =>
      apiFetch<Order>(`/orders/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, notes }),
      }),
    
    cancel: (id: string, reason: string): Promise<Order> =>
      apiFetch<Order>(`/orders/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },

  // Transactions API
  transactions: {
    getAll: (): Promise<Transaction[]> => apiFetch<Transaction[]>('/transactions'),
    
    getOne: (id: string): Promise<Transaction> => apiFetch<Transaction>(`/transactions/${id}`),
    
    create: (data: Partial<Transaction>): Promise<Transaction> =>
      apiFetch<Transaction>('/transactions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    update: (id: string, data: Partial<Transaction>): Promise<Transaction> =>
      apiFetch<Transaction>(`/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  // Reports API
  reports: {
    sales: (startDate: string, endDate: string): Promise<any> =>
      apiFetch(`/reports/sales?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`),
    
    inventory: (): Promise<any> => apiFetch('/reports/inventory'),
    
    profit: (startDate: string, endDate: string): Promise<any> =>
      apiFetch(`/reports/profit?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`),
  },

  // Authentication API
  auth: {
    login: (email: string, password: string): Promise<{ user: any; token?: string }> =>
      apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    
    logout: (): Promise<void> =>
      apiFetch('/auth/logout', {
        method: 'POST',
      }),
    
    getUser: (): Promise<any> => apiFetch('/auth/user'),
    
    refresh: (): Promise<{ token: string }> =>
      apiFetch('/auth/refresh', {
        method: 'POST',
      }),
  },
};

// Export API base URL for use in other files
export { API_BASE_URL };
