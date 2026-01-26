import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { ROLES, Permission } from '../types/permissions';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  requireApproval: (action: string, reason: string) => Promise<boolean>;
  canPerformAction: (action: string, amount?: number) => { allowed: boolean; needsApproval: boolean };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@extremedeptkidz.com',
    role: 'admin',
    fullName: 'Administrator',
    permissions: ROLES.ADMIN.permissions,
    isActive: true,
    lastLogin: new Date(),
    createdAt: new Date(),
  },
  {
    id: '2',
    username: 'manager',
    email: 'manager@extremedeptkidz.com',
    role: 'manager',
    fullName: 'Store Manager',
    permissions: ROLES.MANAGER.permissions,
    isActive: true,
    lastLogin: new Date(),
    createdAt: new Date(),
  },
  {
    id: '3',
    username: 'cashier',
    email: 'cashier@extremedeptkidz.com',
    role: 'cashier',
    fullName: 'John Doe',
    permissions: ROLES.CASHIER.permissions,
    isActive: true,
    lastLogin: new Date(),
    createdAt: new Date(),
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('current_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        parsed.lastLogin = parsed.lastLogin ? new Date(parsed.lastLogin) : new Date();
        parsed.createdAt = parsed.createdAt ? new Date(parsed.createdAt) : new Date();
        const role = ROLES[parsed.role?.toUpperCase?.()];
        if (role) {
          parsed.permissions = role.permissions;
        }
        setUser(parsed);
      } catch {
        setUser(MOCK_USERS[0]);
        localStorage.setItem('current_user', JSON.stringify(MOCK_USERS[0]));
      }
    } else {
      setUser(MOCK_USERS[0]);
      localStorage.setItem('current_user', JSON.stringify(MOCK_USERS[0]));
    }
  }, []);

  const login = async (username: string, _password: string) => {
    const foundUser = MOCK_USERS.find(u => u.username === username);
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('current_user', JSON.stringify(foundUser));
    } else {
      throw new Error('Invalid credentials');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('current_user');
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

    console.log('Approval Request:', {
      requestedBy: user?.username,
      action,
      reason,
      approved,
      timestamp: new Date(),
    });

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
