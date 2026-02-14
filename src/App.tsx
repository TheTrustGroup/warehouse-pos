import { Suspense, useEffect, useRef } from 'react';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { StoreProvider } from './contexts/StoreContext';
import { WarehouseProvider } from './contexts/WarehouseContext';
import { InventoryProvider } from './contexts/InventoryContext';
import { POSProvider } from './contexts/POSContext';
import { OrderProvider } from './contexts/OrderContext';
import { CriticalDataProvider, CriticalDataGate } from './contexts/CriticalDataContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { NetworkStatusProvider } from './contexts/NetworkStatusContext';
import { QUOTA_EVENT } from './lib/offlineQuota';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteErrorBoundary } from './components/ui/RouteErrorBoundary';
import { Button } from './components/ui/Button';
import { Layout } from './components/layout/Layout';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { KeyboardShortcuts } from './components/ui/KeyboardShortcuts';
import { DebugPanel } from './components/debug/DebugPanel';
import { BrowserCheck } from './components/BrowserCheck';
import { OnboardingModal } from './components/OnboardingModal';
import { PERMISSIONS } from './types/permissions';

/** Default landing: Dashboard if user has permission; otherwise redirect to first allowed route (e.g. POS for cashiers). */
function DefaultRoute() {
  const { hasPermission, hasAnyPermission } = useAuth();
  if (hasPermission(PERMISSIONS.DASHBOARD.VIEW)) {
    return <Dashboard />;
  }
  if (hasPermission(PERMISSIONS.POS.ACCESS)) return <Navigate to="/pos" replace />;
  if (hasPermission(PERMISSIONS.INVENTORY.VIEW)) return <Navigate to="/inventory" replace />;
  if (hasPermission(PERMISSIONS.ORDERS.VIEW)) return <Navigate to="/orders" replace />;
  if (hasAnyPermission([PERMISSIONS.REPORTS.VIEW_SALES, PERMISSIONS.REPORTS.VIEW_INVENTORY, PERMISSIONS.REPORTS.VIEW_PROFIT])) return <Navigate to="/reports" replace />;
  if (hasPermission(PERMISSIONS.SETTINGS.VIEW)) return <Navigate to="/settings" replace />;
  return <Navigate to="/pos" replace />;
}

// Lazy load pages with retry so first load after login doesn't show "Something went wrong" on chunk failure
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = lazyWithRetry(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const POS = lazyWithRetry(() => import('./pages/POS').then(m => ({ default: m.POS })));
const Orders = lazyWithRetry(() => import('./pages/Orders').then(m => ({ default: m.Orders })));
const Reports = lazyWithRetry(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Settings = lazyWithRetry(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Login = lazyWithRetry(() => import('./pages/Login').then(m => ({ default: m.Login })));

const Users = () => {
  const navigate = useNavigate();
  
  // Redirect to Settings → Users tab
  useEffect(() => {
    navigate('/settings?tab=users', { replace: true });
  }, [navigate]);
  
  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight mb-1">Users</h1>
        <p className="text-slate-500 text-sm">Redirecting to User Management...</p>
      </div>
      <div className="solid-card text-center p-12">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">User Management</h3>
        <p className="text-slate-600 mb-4">
          User Management is available in <strong>Settings → Users</strong> tab.
        </p>
        <Button variant="primary" onClick={() => navigate('/settings?tab=users')}>
          Go to User Management
        </Button>
      </div>
    </div>
  );
};

const NotFound = lazyWithRetry(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

/** Listens for service worker update event and shows toast. Must be inside ToastProvider. */
function ServiceWorkerUpdateListener() {
  const { showToast } = useToast();
  const handlerRef = useRef(() => {
    showToast('warning', 'App updated - Refresh to see changes');
  });
  handlerRef.current = () => showToast('warning', 'App updated - Refresh to see changes');
  useEffect(() => {
    const handler = () => handlerRef.current();
    window.addEventListener('sw-update', handler);
    return () => window.removeEventListener('sw-update', handler);
  }, []);
  return null;
}

/** Listens for offline storage quota exceeded and shows toast once (INTEGRATION_PLAN). */
function OfflineQuotaToastListener() {
  const { showToast } = useToast();
  const shownRef = useRef(false);
  useEffect(() => {
    const handler = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      showToast(
        'warning',
        'Local storage is full. Some offline features are disabled. Clear local data in Settings → Admin & logs if needed.'
      );
    };
    window.addEventListener(QUOTA_EVENT, handler);
    return () => window.removeEventListener(QUOTA_EVENT, handler);
  }, [showToast]);
  return null;
}

/**
 * Protected Routes: block dashboard until role confirmed from server (Phase 1 stability).
 * No role fallback; invalid role → authError → redirect to login.
 */
function ProtectedRoutes() {
  const { user, isAuthenticated, isLoading, authError } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[var(--min-h-viewport)] flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Invalid role or session: block dashboard and force re-login (authError shown on Login page).
  if (authError) {
    return <Navigate to="/login" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Block dashboard until role is confirmed from server (no UI fallback for role).
  if (user == null) {
    return (
      <div className="min-h-[var(--min-h-viewport)] flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <CriticalDataProvider>
      <StoreProvider>
        <WarehouseProvider>
          <InventoryProvider>
            <POSProvider>
              <OrderProvider>
                <CriticalDataGate>
                  <Layout />
                </CriticalDataGate>
              </OrderProvider>
            </POSProvider>
          </InventoryProvider>
        </WarehouseProvider>
      </StoreProvider>
    </CriticalDataProvider>
  );
}

function App() {
  return (
    <BrowserCheck>
    <ToastProvider>
      <ServiceWorkerUpdateListener />
      <OfflineQuotaToastListener />
      <NetworkStatusProvider>
        <SettingsProvider>
          <AuthProvider>
            <BrowserRouter>
            <OnboardingModal />
            <Suspense fallback={<div className="min-h-[var(--min-h-viewport)] flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 gap-4"><LoadingSpinner size="lg" /><p className="text-slate-600 text-sm font-medium">Loading…</p></div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<ProtectedRoutes />}>
                        <Route
                          index
                          element={
                            <ProtectedRoute
                              allowedRoles={['admin', 'super_admin', 'manager']}
                              redirectPathIfForbidden="/pos"
                            >
                              <RouteErrorBoundary routeName="Dashboard">
                                <DefaultRoute />
                              </RouteErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="inventory"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.INVENTORY.VIEW}>
                              <RouteErrorBoundary routeName="Inventory">
                                <Inventory />
                              </RouteErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="orders"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.ORDERS.VIEW}>
                              <RouteErrorBoundary routeName="Orders">
                                <Orders />
                              </RouteErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="pos"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.POS.ACCESS}>
                              <RouteErrorBoundary routeName="POS">
                                <POS />
                              </RouteErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="reports"
                          element={
                            <ProtectedRoute
                              allowedRoles={['admin', 'super_admin', 'manager']}
                              redirectPathIfForbidden="/pos"
                              anyPermissions={[
                                PERMISSIONS.REPORTS.VIEW_SALES,
                                PERMISSIONS.REPORTS.VIEW_INVENTORY,
                                PERMISSIONS.REPORTS.VIEW_PROFIT,
                              ]}
                            >
                              <RouteErrorBoundary routeName="Reports">
                                <Reports />
                              </RouteErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="users"
                          element={
                            <ProtectedRoute
                              allowedRoles={['admin', 'super_admin', 'manager']}
                              redirectPathIfForbidden="/pos"
                              permission={PERMISSIONS.USERS.VIEW}
                            >
                              <RouteErrorBoundary routeName="User Management">
                                <Users />
                              </RouteErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="settings"
                          element={
                            <ProtectedRoute
                              allowedRoles={['admin', 'super_admin', 'manager']}
                              redirectPathIfForbidden="/pos"
                              permission={PERMISSIONS.SETTINGS.VIEW}
                            >
                              <RouteErrorBoundary routeName="Settings">
                                <Settings />
                              </RouteErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                      </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <KeyboardShortcuts />
            <DebugPanel />
            </BrowserRouter>
          </AuthProvider>
        </SettingsProvider>
      </NetworkStatusProvider>
    </ToastProvider>
    </BrowserCheck>
  );
}

export default App;
