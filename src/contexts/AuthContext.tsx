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

/** Role is authoritative from server only. Never derive or upgrade on client. */
const KNOWN_ROLE_IDS = ['super_admin', 'admin', 'manager', 'cashier', 'warehouse', 'driver', 'viewer'] as const;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Blocking error when role could not be resolved (e.g. invalid role from API). User must log out. */
  authError: string | null;
  /** True when user was signed out due to inactivity (show message on login page) */
  sessionExpired: boolean;
  /** Clear the session-expired message (call from Login on mount) */
  clearSessionExpired: () => void;
  /** Clear blocking auth error (e.g. after logout). */
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<void>;
  /** Sign in with local data only when the server is unreachable. No API call. */
  loginOffline: (email: string) => void;
  logout: () => Promise<void>;
  /** Switch role for demo/testing only (admins). Never used for initial role resolution. */
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

/** Known admin email so login always works even when backend returns wrong/missing role. Prevents "Role could not be verified" for admin. */
const KNOWN_ADMIN_EMAIL = 'info@extremedeptkidz.com';

/** POS emails (Main Store/DC and Main Town) — same as backend; fallback to cashier when server returns 200 but role invalid/missing. */
const KNOWN_POS_EMAILS = new Set([
  'cashier@extremedeptkidz.com',
  'maintown_cashier@extremedeptkidz.com',
]);

/** Backend role values that should be treated as cashier (POS access, no admin). */
const CASHIER_ROLE_ALIASES = ['cashier', 'sales_person', 'salesperson', 'sales'];

/**
 * Build a fallback admin User when server returns 200 but role is missing/invalid.
 * Used only for KNOWN_ADMIN_EMAIL so admin login never shows "Role could not be verified".
 */
function buildFallbackAdminUser(userData: any): User {
  const email = (userData.email ?? KNOWN_ADMIN_EMAIL).trim().toLowerCase();
  const role = ROLES.SUPER_ADMIN;
  return {
    id: userData.id ?? 'api-session-user',
    username: userData.username || email.split('@')[0] || 'user',
    email: userData.email ?? email,
    role: 'super_admin',
    fullName: userData.fullName || userData.name || email,
    avatar: userData.avatar,
    permissions: userData.permissions ?? role.permissions,
    isActive: userData.isActive !== undefined ? userData.isActive : true,
    lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : new Date(),
    createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
    warehouseId: userData.warehouse_id ?? userData.warehouseId ?? undefined,
    storeId: userData.store_id !== undefined ? userData.store_id : userData.storeId,
    deviceId: userData.device_id ?? userData.deviceId ?? undefined,
    assignedPos: userData.assignedPos === 'main_town' || userData.assignedPos === 'store' ? userData.assignedPos : undefined,
  };
}

/**
 * Build a fallback cashier User when server returns 200 but role is missing/invalid.
 * Used only for KNOWN_POS_EMAILS so POS logins never show "Role could not be verified".
 */
function buildFallbackCashierUser(userData: any): User {
  const email = (userData.email ?? '').trim().toLowerCase();
  const role = ROLES.CASHIER;
  return {
    id: userData.id ?? 'api-session-user',
    username: userData.username || userData.email?.split('@')[0] || 'user',
    email: userData.email ?? email,
    role: 'cashier',
    fullName: userData.fullName || userData.name || userData.email || email,
    avatar: userData.avatar,
    permissions: userData.permissions ?? role.permissions,
    isActive: userData.isActive !== undefined ? userData.isActive : true,
    lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : new Date(),
    createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
    warehouseId: userData.warehouse_id ?? userData.warehouseId ?? undefined,
    storeId: userData.store_id !== undefined ? userData.store_id : userData.storeId,
    deviceId: userData.device_id ?? userData.deviceId ?? undefined,
    assignedPos: userData.assignedPos === 'main_town' || userData.assignedPos === 'store' ? userData.assignedPos : undefined,
  };
}

/**
 * Normalize user data from API response. Role is SERVER-AUTHORITATIVE only.
 * - No client-side role derivation from email. No fallback to viewer.
 * - If server returns a role not in KNOWN_ROLE_IDS, returns null (caller must show blocking error).
 * - Exceptions: VITE_SUPER_ADMIN_EMAILS forces super_admin; KNOWN_ADMIN_EMAIL (info@) and KNOWN_POS_EMAILS always accepted when server returns 200 but role invalid/missing.
 */
function normalizeUserData(userData: any): User | null {
  const rawRole = (userData.role ?? '').toString().trim().toLowerCase();
  const roleKey = rawRole.toUpperCase().replace(/\s+/g, '_');
  let role = ROLES[roleKey] ?? (rawRole === 'super_admin' ? ROLES.SUPER_ADMIN : null);
  if (!role && CASHIER_ROLE_ALIASES.includes(rawRole)) role = ROLES.CASHIER;
  const email = (userData.email ?? '').trim().toLowerCase();
  const superAdminEmails = getSuperAdminEmails();
  const isSuperAdmin = superAdminEmails.has(email);
  if (!role && !isSuperAdmin) {
    if (email === KNOWN_ADMIN_EMAIL) return buildFallbackAdminUser(userData);
    if (KNOWN_POS_EMAILS.has(email)) return buildFallbackCashierUser(userData);
    return null;
  }
  const effectiveRole = isSuperAdmin ? ROLES.SUPER_ADMIN : role!;
  const roleId = (isSuperAdmin ? 'super_admin' : role!.id) as User['role'];
  if (!KNOWN_ROLE_IDS.includes(roleId)) {
    if (email === KNOWN_ADMIN_EMAIL) return buildFallbackAdminUser(userData);
    if (KNOWN_POS_EMAILS.has(email)) return buildFallbackCashierUser(userData);
    return null;
  }

  return {
    id: userData.id,
    username: userData.username || userData.email?.split('@')[0] || 'user',
    email: userData.email,
    role: roleId,
    fullName: userData.fullName || userData.name || userData.email,
    avatar: userData.avatar,
    permissions: userData.permissions ?? effectiveRole.permissions,
    isActive: userData.isActive !== undefined ? userData.isActive : true,
    lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : new Date(),
    createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
    warehouseId: userData.warehouse_id ?? userData.warehouseId ?? undefined,
    storeId: userData.store_id !== undefined ? userData.store_id : userData.storeId,
    deviceId: userData.device_id ?? userData.deviceId ?? undefined,
    assignedPos: userData.assignedPos === 'main_town' || userData.assignedPos === 'store' ? userData.assignedPos : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottleRef = useRef<number>(0);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);
  const clearAuthError = useCallback(() => setAuthError(null), []);

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
        if (!normalizedUser) {
          setAuthError('Your role could not be verified. Please log out and log in again.');
          setUser(null);
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('current_user');
            localStorage.removeItem('auth_token');
          }
          return;
        }
        setAuthError(null);
        if (typeof localStorage !== 'undefined') localStorage.removeItem(DEMO_ROLE_KEY);
        lastActivityRef.current = Date.now();
        setUser(normalizedUser);
        localStorage.setItem('current_user', JSON.stringify(normalizedUser));
      } else {
        setAuthError(null);
        setUser(null);
        localStorage.removeItem('current_user');
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      setAuthError(null);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setUser(null);
        localStorage.removeItem('current_user');
        localStorage.removeItem('auth_token');
      } else {
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

    try {
      // Try /admin/api/login first (same origin as admin panel)
      let response = await fetch(`${API_BASE_URL}/admin/api/login`, { ...baseOpts, body: JSON.stringify(loginBody) });
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/auth/login`, { ...baseOpts, body: JSON.stringify(loginBody) });
      }

      if (!response.ok) {
        const responseText = await response.text();
        let errorData: any;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { message: responseText || 'Invalid email or password' };
        }

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
      if (!normalizedUser) {
        throw new Error('The server did not return a valid role. Please contact your administrator.');
      }
      setAuthError(null);
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
      setAuthError(null);
      setUser(null);
      localStorage.removeItem('current_user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem(DEMO_ROLE_KEY);
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
        authError,
        sessionExpired,
        clearSessionExpired,
        clearAuthError,
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
