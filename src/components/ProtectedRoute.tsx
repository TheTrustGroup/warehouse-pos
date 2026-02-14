import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Permission } from '../types/permissions';
import { User } from '../types';
import { Button, Card } from '../components/ui';
import { ShieldX } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: Permission;
  anyPermissions?: Permission[];
  allPermissions?: Permission[];
  /** When set, only these roles can access; others are redirected to redirectPathIfForbidden or their default path. */
  allowedRoles?: User['role'][];
  /** Where to send users whose role is not in allowedRoles (default: role-based default path e.g. /pos for cashier). */
  redirectPathIfForbidden?: string;
}

export function ProtectedRoute({
  children,
  permission,
  anyPermissions,
  allPermissions,
  allowedRoles,
  redirectPathIfForbidden,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, hasPermission, hasAnyPermission, hasAllPermissions, hasRole, getDefaultPathForRole } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-[var(--min-h-viewport)] flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Role verification: redirect if this route is restricted to certain roles and user's role is not allowed
  if (allowedRoles != null && allowedRoles.length > 0 && user && !hasRole(allowedRoles)) {
    const redirectTo = redirectPathIfForbidden ?? getDefaultPathForRole();
    return <Navigate to={redirectTo} replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <AccessDenied />;
  }

  if (anyPermissions && !hasAnyPermission(anyPermissions)) {
    return <AccessDenied />;
  }

  if (allPermissions && !hasAllPermissions(allPermissions)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

function AccessDenied() {
  const { user } = useAuth();

  return (
    <div className="min-h-[var(--min-h-viewport)] flex items-center justify-center bg-slate-50">
      <Card className="max-w-md text-center p-8">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-10 h-10 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600 mb-4">
          You don&apos;t have permission to access this page.
        </p>
        <p className="text-sm text-slate-500">
          Your role: <strong className="text-slate-700">{user?.role ?? '—'}</strong>
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Contact your administrator if you need access.
        </p>
        <Button variant="primary" onClick={() => window.history.back()} className="mt-6">
          Go Back
        </Button>
      </Card>
    </div>
  );
}
