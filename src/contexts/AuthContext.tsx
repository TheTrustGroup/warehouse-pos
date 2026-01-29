import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { ROLES, Permission } from '../types/permissions';
import { API_BASE_URL, handleApiResponse } from '../lib/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
      
      // Check if user is authenticated
      // Try /admin/api/me first (based on discovered endpoints), fallback to /api/auth/user
      const response = await fetch(`${API_BASE_URL}/admin/api/me`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        credentials: 'include', // Include cookies
      }).catch(() => 
        // Fallback to standard auth endpoint if /admin/api/me doesn't work
        fetch(`${API_BASE_URL}/api/auth/user`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          credentials: 'include',
        })
      );

      if (response.ok) {
        const userData = await handleApiResponse<User>(response);
        const normalizedUser = normalizeUserData(userData);
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
   * Login with email and password
   */
  const login = async (email: string, password: string) => {
    try {
      // Try /admin/api/login first, fallback to /api/auth/login
      let response = await fetch(`${API_BASE_URL}/admin/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include', // Include cookies for httpOnly cookie support
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      
      // If 404, try standard endpoint
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ email: email.trim(), password: password.trim() }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          message: 'Invalid email or password' 
        }));
        throw new Error(errorData.message || 'Invalid email or password');
      }

      const data = await handleApiResponse<{ user: User; token?: string }>(response);
      
      // Normalize user data
      const normalizedUser = normalizeUserData(data.user);
      
      // Store user data
      setUser(normalizedUser);
      localStorage.setItem('current_user', JSON.stringify(normalizedUser));
      
      // Store token if provided (for Bearer token authentication)
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  /**
   * Logout and clear session
   */
  const logout = async () => {
    try {
      // Call logout endpoint to invalidate session on server
      // Try /admin/api/logout first, fallback to /api/auth/logout
      await fetch(`${API_BASE_URL}/admin/api/logout`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() =>
        fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        })
      );
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with local logout even if API call fails
    } finally {
      // Clear local state regardless of API call result
      setUser(null);
      localStorage.removeItem('current_user');
      localStorage.removeItem('auth_token');
      // Redirect to login page
      window.location.href = '/login';
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
        logout,
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
