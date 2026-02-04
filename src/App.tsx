import { Suspense, useEffect } from 'react';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { InventoryProvider } from './contexts/InventoryContext';
import { POSProvider } from './contexts/POSContext';
import { OrderProvider } from './contexts/OrderContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { KeyboardShortcuts } from './components/ui/KeyboardShortcuts';
import { PERMISSIONS } from './types/permissions';

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
      <div className="glass-card text-center p-12">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">User Management</h3>
        <p className="text-slate-600 mb-4">
          User Management is available in <strong>Settings → Users</strong> tab.
        </p>
        <button
          onClick={() => navigate('/settings?tab=users')}
          className="btn-primary"
        >
          Go to User Management
        </button>
      </div>
    </div>
  );
};

const NotFound = lazyWithRetry(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

/**
 * Protected Routes Wrapper
 * Checks authentication before rendering the Layout
 */
function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <InventoryProvider>
            <POSProvider>
              <OrderProvider>
                <BrowserRouter>
                  <Suspense fallback={<LoadingSpinner />}>
                    <Routes>
                      {/* Public Route */}
                      <Route path="/login" element={<Login />} />
                      
                      {/* Protected Routes */}
                      <Route path="/" element={<ProtectedRoutes />}>
                        <Route
                          index
                          element={
                            <ProtectedRoute permission={PERMISSIONS.DASHBOARD.VIEW}>
                              <Dashboard />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="inventory"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.INVENTORY.VIEW}>
                              <Inventory />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="orders"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.ORDERS.VIEW}>
                              <Orders />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="pos"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.POS.ACCESS}>
                              <POS />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="reports"
                          element={
                            <ProtectedRoute
                              anyPermissions={[
                                PERMISSIONS.REPORTS.VIEW_SALES,
                                PERMISSIONS.REPORTS.VIEW_INVENTORY,
                                PERMISSIONS.REPORTS.VIEW_PROFIT,
                              ]}
                            >
                              <Reports />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="users"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.USERS.VIEW}>
                              <Users />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="settings"
                          element={
                            <ProtectedRoute permission={PERMISSIONS.SETTINGS.VIEW}>
                              <Settings />
                            </ProtectedRoute>
                          }
                        />
                      </Route>

                      {/* Catch all - 404 page */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  <KeyboardShortcuts />
                </BrowserRouter>
              </OrderProvider>
            </POSProvider>
          </InventoryProvider>
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}

export default App;
