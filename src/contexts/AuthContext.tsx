import { createContext, useContext, useState, useRef, ReactNode, useEffect, useCallback } from 'react';
import { User } from '../types';
import { ROLES, PERMISSIONS, Permission } from '../types/permissions';
import { API_BASE_URL, handleApiResponse } from '../lib/api';

const DEMO_ROLE_KEY = 'warehouse_demo_role';

/** Inactivity timeout: require re-login after this many ms without user activity (default 30 min) */
const INACTIVITY_TIMEOUT_MS = (() => {
  const min = Number(import.meta.env.VITE_INACTIVITY_TIMEOUT_MIN);
  return min > 0 ? min * 60 * 1000 : 30 * 60 * 1000;
})();

/** Throttle activity updates to at most once per 30 seconds */
const ACTIVITY_THROTTLE_MS = 30 * 1000;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True when user was signed out due to inactivity (show message on login page) */
  sessionExpired: boolean;
  /** Clear the session-expired message (call from Login on mount) */
  clearSessionExpired: () => void;
  login: (email: string, password: string) => Promise<void>;
  /** Sign in with local data only when the server is unreachable. No API call. */
  loginOffline: (email: string) => void;
  logout: () => Promise<void>;
  /** Switch role for demo/testing so you can see all inventory and POS features */
  switchRole: (roleId: string) => void;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  requireApproval: (action: string, reason: string) => Promise<boolean>;
  canPerformAction: (action: string, amount?: number) => { allowed: boolean; needsApproval: boolean };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Comma-separated list of emails that are always treated as Super Admin (your current logins). Set in .env as VITE_SUPER_ADMIN_EMAILS. */
function getSuperAdminEmails(): Set<string> {
  const raw = import.meta.env.VITE_SUPER_ADMIN_EMAILS;
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(raw.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean));
}

/** Backend role values that should be treated as cashier (POS access, no admin). */
const CASHIER_ROLE_ALIASES = ['cashier', 'sales_person', 'salesperson', 'sales'];

const KNOWN_ROLE_IDS = ['super_admin', 'admin', 'manager', 'cashier', 'warehouse', 'driver', 'viewer'] as const;

/** Derive role from email local part (same logic as backend): role, role_place, or place_role. */
function roleFromEmailLocalPart(email: string): typeof KNOWN_ROLE_IDS[number] | null {
  const local = (email || '').trim().toLowerCase().split('@')[0] ?? '';
  if (KNOWN_ROLE_IDS.includes(local as any)) return local as typeof KNOWN_ROLE_IDS[number];
  const parts = local.split('_').filter(Boolean);
  if (parts.length >= 2) {
    if (KNOWN_ROLE_IDS.includes(parts[0] as any)) return parts[0] as typeof KNOWN_ROLE_IDS[number];
    if (KNOWN_ROLE_IDS.includes(parts[parts.length - 1] as any)) return parts[parts.length - 1] as typeof KNOWN_ROLE_IDS[number];
  }
  return null;
}

/**
 * Normalize user data from API response.
 * If user email is in VITE_SUPER_ADMIN_EMAILS, role is forced to super_admin.
 * If backend returns viewer but email suggests another role (e.g. maintown_cashier@), use that so POS logins work regardless of auth backend.
 */
function normalizeUserData(userData: any): User {
  const rawRole = (userData.role ?? '').toString().trim().toLowerCase();
  const roleKey = rawRole.toUpperCase().replace(/\s+/g, '_');
  let role = ROLES[roleKey] ?? (rawRole === 'super_admin' ? ROLES.SUPER_ADMIN : null);
  if (!role && CASHIER_ROLE_ALIASES.includes(rawRole)) role = ROLES.CASHIER;
  const email = (userData.email ?? '').trim().toLowerCase();
  const superAdminEmails = getSuperAdminEmails();
  const isSuperAdmin = superAdminEmails.has(email);
  if (!isSuperAdmin && (!role || role.id === 'viewer')) {
    const fromEmail = roleFromEmailLocalPart(email);
    if (fromEmail && fromEmail !== 'viewer') role = ROLES[fromEmail.toUpperCase() as keyof typeof ROLES] ?? ROLES.CASHIER;
  }
  role = role ?? ROLES.VIEWER;
  const effectiveRole = isSuperAdmin ? ROLES.SUPER_ADMIN : role;
  
  return {
    id: userData.id,
    username: userData.username || userData.email?.split('@')[0] || 'user',
    email: userData.email,
    role: (isSuperAdmin ? 'super_admin' : role.id) as User['role'],
    fullName: userData.fullName || userData.name || userData.email,
    avatar: userData.avatar,
    permissions: userData.permissions ?? effectiveRole.permissions,
    isActive: userData.isActive !== undefined ? userData.isActive : true,
    lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : new Date(),
    createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
    warehouseId: userData.warehouse_id ?? userData.warehouseId ?? undefined,
    storeId: userData.store_id !== undefined ? userData.store_id : userData.storeId,
    deviceId: userData.device_id ?? userData.deviceId ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottleRef = useRef<number>(0);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Track user activity for inactivity timeout (only when authenticated)
  useEffect(() => {
    if (!user) return;

    const touchActivity = () => {
      const now = Date.now();
      if (now - lastThrottleRef.current < ACTIVITY_THROTTLE_MS) return;
      lastThrottleRef.current = now;
      lastActivityRef.current = now;
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;
    events.forEach((ev) => window.addEventListener(ev, touchActivity));
    const onFocus = () => touchActivity();
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && touchActivity());

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, touchActivity));
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
    };
  }, [user]);

  // Inactivity check: sign out and require re-login when session has been dormant too long
  useEffect(() => {
    if (!user || INACTIVITY_TIMEOUT_MS <= 0) return;

    const interval = setInterval(() => {
      if (!user) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        setSessionExpired(true);
        setUser(null);
        localStorage.removeItem('current_user');
        localStorage.removeItem('auth_token');
        try {
          fetch(`${API_BASE_URL}/admin/api/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
          fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
        } catch {
          // ignore
        }
      }
    }, 60 * 1000); // check every minute

    return () => clearInterval(interval);
  }, [user]);

  /**
   * Check if user is authenticated by calling the API
   */
  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      const headers: HeadersInit = { 'Accept': 'application/json' };
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const opts = { method: 'GET' as const, headers, credentials: 'include' as const };

      // Try /admin/api/me first, then /api/auth/user on 404 or 403 (so cashiers never get stuck when /admin returns Forbidden)
      let response = await fetch(`${API_BASE_URL}/admin/api/me`, opts);
      if (response.status === 404 || response.status === 403) {
        response = await fetch(`${API_BASE_URL}/api/auth/user`, opts);
      }

      if (response.ok) {
        const userData = await handleApiResponse<User>(response);
        const normalizedUser = normalizeUserData(userData);
        // Do not apply persisted demo role: use backend role so cashier sees cashier features only.
        if (typeof localStorage !== 'undefined') localStorage.removeItem(DEMO_ROLE_KEY);
        lastActivityRef.current = Date.now();
        setUser(normalizedUser);
        localStorage.setItem('current_user', JSON.stringify(normalizedUser));
      } else {
        // Not authenticated or session expired - this is expected when not logged in
        setUser(null);
        localStorage.removeItem('current_user');
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      // Silently handle network errors - user is simply not authenticated
      // Only log if it's not a network error (CORS, fetch failure, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network/CORS error - silently fail, user is not authenticated
        setUser(null);
        localStorage.removeItem('current_user');
        localStorage.removeItem('auth_token');
      } else {
        // Other errors - log but don't show to user
        console.error('Auth check failed:', error);
        setUser(null);
        localStorage.removeItem('current_user');
        localStorage.removeItem('auth_token');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Switch role for demo/testing. Persists in localStorage so it survives refresh.
   * Use this to see all inventory features (e.g. Admin) when the API returns Viewer.
   */
  const switchRole = (roleId: string) => {
    const role = Object.values(ROLES).find((r) => r.id === roleId);
    if (!role || !user) return;
    localStorage.setItem(DEMO_ROLE_KEY, roleId);
    setUser({ ...user, role: role.id as User['role'], permissions: role.permissions });
    localStorage.setItem('current_user', JSON.stringify({ ...user, role: role.id, permissions: role.permissions }));
  };

  /**
   * Sign in using only local data (no server). Use when the server is unreachable
   * so you can still view and manage warehouse-recorded inventory.
   */
  const loginOffline = (email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;
    const adminRole = ROLES.ADMIN;
    const offlineUser: User = {
      id: `offline-${crypto.randomUUID()}`,
      username: trimmedEmail.split('@')[0],
      email: trimmedEmail,
      role: 'admin',
      fullName: trimmedEmail,
      permissions: adminRole.permissions,
      isActive: true,
      lastLogin: new Date(),
      createdAt: new Date(),
    };
    setUser(offlineUser);
    localStorage.setItem('current_user', JSON.stringify(offlineUser));
  };

  /**
   * Login with email and password.
   * Tries admin API first, then standard auth. Sends both email and username for compatibility.
   */
  const login = async (email: string, password: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      throw new Error('Please enter email and password');
    }

    const loginBody = { email: trimmedEmail, password: trimmedPassword };
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    const baseOpts = { method: 'POST' as const, headers, credentials: 'include' as const };

    // Log request details for debugging (without exposing password)
    console.log('Login request:', {
      url: `${API_BASE_URL}/admin/api/login`,
      email: trimmedEmail,
      emailLength: trimmedEmail.length,
      passwordLength: trimmedPassword.length,
      passwordFirstChar: trimmedPassword.charAt(0),
      passwordLastChar: trimmedPassword.charAt(trimmedPassword.length - 1),
      passwordHasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(trimmedPassword),
      body: { email: trimmedEmail, password: '[REDACTED]' }
    });
    
    // Log the actual JSON being sent (for debugging - remove in production)
    console.log('Request payload:', JSON.stringify(loginBody));

    try {
      // Try /admin/api/login first (same origin as admin panel)
      let response = await fetch(`${API_BASE_URL}/admin/api/login`, { ...baseOpts, body: JSON.stringify(loginBody) });
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/auth/login`, { ...baseOpts, body: JSON.stringify(loginBody) });
      }

      if (!response.ok) {
        // Read response as text first so we can log it and parse it
        const responseText = await response.text();
        console.error('Raw error response text:', responseText);
        
        let errorData: any;
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          errorData = { message: responseText || 'Invalid email or password' };
        }
        
        // Log full error response for debugging
        console.error('Login error response:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          errorData,
          requestEmail: trimmedEmail,
          requestPasswordLength: trimmedPassword.length,
          // Show password hints without exposing it
          passwordHint: `Length: ${trimmedPassword.length}, First char: ${trimmedPassword.charAt(0)}, Last char: ${trimmedPassword.charAt(trimmedPassword.length - 1)}`
        });
        
        // Handle validation errors (400, 422) with detailed field messages
        if ((response.status === 400 || response.status === 422) && errorData?.errors) {
          const validationErrors: string[] = [];
          // Check all possible error fields
          Object.keys(errorData.errors).forEach(field => {
            const fieldErrors = errorData.errors[field];
            if (fieldErrors) {
              const errorMsg = Array.isArray(fieldErrors) ? fieldErrors.join(', ') : String(fieldErrors);
              validationErrors.push(`${field.charAt(0).toUpperCase() + field.slice(1)}: ${errorMsg}`);
            }
          });
          if (validationErrors.length > 0) {
            throw new Error(validationErrors.join('; '));
          }
        }
        
        // Handle backend error format: {success: false, error: "...", code: "..."}
        // Priority: errorData.error > errorData.message > default message
        let msg = errorData?.error || errorData?.message;
        
        // Add code context if available for better debugging
        if (errorData?.code && errorData.code !== 'VALIDATION_ERROR') {
          msg = msg ? `${msg} (${errorData.code})` : errorData.code;
        }
        
        // If no specific message, use status-based defaults
        if (!msg) {
          if (response.status === 401) {
            msg = 'Invalid email or password';
          } else if (response.status === 400 || response.status === 422) {
            msg = 'Validation failed. Please check your email and password format.';
          } else {
            msg = 'Login failed';
          }
        }
        
        // For validation errors without field-specific errors, provide helpful guidance
        if ((response.status === 400 || response.status === 422) && errorData?.code === 'VALIDATION_ERROR' && !errorData?.errors) {
          // Generic validation error - provide helpful hints
          msg = `${msg}. Please check: email format, password (case-sensitive), and ensure the user exists.`;
        }
        
        throw new Error(typeof msg === 'string' ? msg : 'Invalid email or password');
      }

      const data = await response.json().catch(() => ({}));
      // Support multiple response shapes: { user }, { data: { user } }, or user at top level
      const userPayload = data?.user ?? data?.data?.user ?? data;
      if (!userPayload || typeof userPayload !== 'object') {
        throw new Error('Invalid login response');
      }
      const normalizedUser = normalizeUserData(userPayload);
      // Use backend role only on login so cashier gets cashier permissions, not a previously stored demo role.
      if (typeof localStorage !== 'undefined') localStorage.removeItem(DEMO_ROLE_KEY);
      lastActivityRef.current = Date.now();
      setUser(normalizedUser);
      localStorage.setItem('current_user', JSON.stringify(normalizedUser));
      const token = data?.token ?? data?.access_token ?? data?.data?.token;
      if (token) {
        localStorage.setItem('auth_token', token.startsWith('Bearer ') ? token : `Bearer ${token}`);
      }
    } catch (error) {
      console.error('Login failed:', error);
      // Throw user-friendly message for network/connection errors
      if (error instanceof TypeError && /load failed|failed to fetch|network/i.test((error as Error).message)) {
        throw new Error('Cannot reach the server. Check your connection and try again.');
      }
      throw error;
    }
  };

  /**
   * Logout and clear session
   */
  const logout = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/api/logout`, { method: 'POST', credentials: 'include' });
      if (res.status === 404) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of API call result
      setUser(null);
      localStorage.removeItem('current_user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem(DEMO_ROLE_KEY);
      // No full page redirect: re-render lets ProtectedRoutes return <Navigate to="/login" />,
      // avoiding "Importing a module script failed" from cached index/chunks after deploy.
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    if (permission === PERMISSIONS.POS.ACCESS && user.role === 'cashier') return true;
    return user.permissions.includes(permission);
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    if (!user) return false;
    return permissions.some(p => user.permissions.includes(p));
  };

  const hasAllPermissions = (permissions: Permission[]): boolean => {
    if (!user) return false;
    return permissions.every(p => user.permissions.includes(p));
  };

  const requireApproval = async (action: string, reason: string): Promise<boolean> => {
    const approved = window.confirm(
      `Manager approval required for: ${action}\nReason: ${reason}\n\nSimulate approval?`
    );

    return approved;
  };

  const canPerformAction = (action: string, amount?: number) => {
    if (!user) return { allowed: false, needsApproval: false };

    const role = ROLES[user.role.toUpperCase()];
    if (!role || !role.limits) {
      return { allowed: true, needsApproval: false };
    }

    if (action === 'discount' && amount != null && role.limits.maxDiscount != null) {
      if (amount > role.limits.maxDiscount) {
        const requiresApproval = role.limits.requireManagerApproval?.discount;
        if (requiresApproval != null && amount > requiresApproval) {
          return { allowed: false, needsApproval: true };
        }
        return { allowed: false, needsApproval: false };
      }
    }

    if (action === 'refund' && amount != null && role.limits.maxRefundAmount != null) {
      if (amount > role.limits.maxRefundAmount) {
        return { allowed: false, needsApproval: true };
      }
    }

    if (action === 'transaction' && amount != null && role.limits.maxTransactionAmount != null) {
      if (amount > role.limits.maxTransactionAmount) {
        return { allowed: false, needsApproval: true };
      }
    }

    if (role.limits.requireManagerApproval) {
      const approval = role.limits.requireManagerApproval;

      if (action === 'void' && approval.void) {
        return { allowed: false, needsApproval: true };
      }

      if (action === 'refund' && approval.refund) {
        return { allowed: false, needsApproval: true };
      }

      if (action === 'price_override' && approval.priceOverride) {
        return { allowed: false, needsApproval: true };
      }
    }

    return { allowed: true, needsApproval: false };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        sessionExpired,
        clearSessionExpired,
        login,
        loginOffline,
        logout,
        switchRole,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        requireApproval,
        canPerformAction,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

/** Use auth when inside AuthProvider; returns undefined when outside (e.g. tests). Lets WarehouseProvider work in both cases. */
export function useOptionalAuth() {
  return useContext(AuthContext) ?? undefined;
}
