import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Permission } from '../types/permissions';
import { ShieldX } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: Permission;
  anyPermissions?: Permission[];
  allPermissions?: Permission[];
}

export function ProtectedRoute({
  children,
  permission,
  anyPermissions,
  allPermissions,
}: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission, hasAnyPermission, hasAllPermissions } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="glass-card max-w-md text-center p-8">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-10 h-10 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600 mb-4">
          You don&apos;t have permission to access this page.
        </p>
        <p className="text-sm text-slate-500">
          Your role: <strong className="text-slate-700">{user?.role}</strong>
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Contact your administrator if you need access.
        </p>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="btn-primary mt-6"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
