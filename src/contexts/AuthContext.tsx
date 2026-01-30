import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { ROLES, Permission } from '../types/permissions';
import { API_BASE_URL, handleApiResponse } from '../lib/api';

const DEMO_ROLE_KEY = 'warehouse_demo_role';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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

/**
 * Normalize user data from API response
 */
function normalizeUserData(userData: any): User {
  const role = ROLES[userData.role?.toUpperCase?.()] || ROLES.VIEWER;
  
  return {
    id: userData.id,
    username: userData.username || userData.email?.split('@')[0] || 'user',
    email: userData.email,
    role: userData.role || 'viewer',
    fullName: userData.fullName || userData.name || userData.email,
    avatar: userData.avatar,
    permissions: userData.permissions || role.permissions,
    isActive: userData.isActive !== undefined ? userData.isActive : true,
    lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : new Date(),
    createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  /**
   * Check if user is authenticated by calling the API
   */
  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      const headers = { 'Accept': 'application/json' };
      const opts = { method: 'GET' as const, headers, credentials: 'include' as const };

      // Try /admin/api/me first (same origin as admin panel), then /api/auth/user
      let response = await fetch(`${API_BASE_URL}/admin/api/me`, opts);
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/auth/user`, opts);
      }

      if (response.ok) {
        const userData = await handleApiResponse<User>(response);
        let normalizedUser = normalizeUserData(userData);
        const demoRoleId = typeof localStorage !== 'undefined' ? localStorage.getItem(DEMO_ROLE_KEY) : null;
        const demoRole = demoRoleId ? Object.values(ROLES).find((r) => r.id === demoRoleId) : null;
        if (demoRole) {
          normalizedUser = { ...normalizedUser, role: demoRole.id as User['role'], permissions: demoRole.permissions };
        }
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

    try {
      // Try /admin/api/login first (same origin as admin panel)
      let response = await fetch(`${API_BASE_URL}/admin/api/login`, { ...baseOpts, body: JSON.stringify(loginBody) });
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/auth/login`, { ...baseOpts, body: JSON.stringify(loginBody) });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Invalid email or password' }));
        const msg = errorData?.message || errorData?.error || (response.status === 401 ? 'Invalid email or password' : 'Login failed');
        throw new Error(typeof msg === 'string' ? msg : 'Invalid email or password');
      }

      const data = await response.json().catch(() => ({}));
      // Support multiple response shapes: { user }, { data: { user } }, or user at top level
      const userPayload = data?.user ?? data?.data?.user ?? data;
      if (!userPayload || typeof userPayload !== 'object') {
        throw new Error('Invalid login response');
      }
      let normalizedUser = normalizeUserData(userPayload);
      const demoRoleId = typeof localStorage !== 'undefined' ? localStorage.getItem(DEMO_ROLE_KEY) : null;
      const demoRole = demoRoleId ? Object.values(ROLES).find((r) => r.id === demoRoleId) : null;
      if (demoRole) {
        normalizedUser = { ...normalizedUser, role: demoRole.id as User['role'], permissions: demoRole.permissions };
      }
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
      let res = await fetch(`${API_BASE_URL}/admin/api/logout`, { method: 'POST', credentials: 'include' });
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
      // No full page redirect: re-render lets ProtectedRoutes return <Navigate to="/login" />,
      // avoiding "Importing a module script failed" from cached index/chunks after deploy.
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
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
