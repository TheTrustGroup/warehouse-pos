import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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

// Lazy load pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const POS = lazy(() => import('./pages/POS').then(m => ({ default: m.POS })));
const Orders = lazy(() => import('./pages/Orders').then(m => ({ default: m.Orders })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));

const Users = () => <div className="card"><h2 className="text-2xl font-bold">Users</h2></div>;

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <SettingsProvider>
          <InventoryProvider>
            <POSProvider>
              <OrderProvider>
                <BrowserRouter>
                  <Suspense fallback={<LoadingSpinner />}>
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route path="/" element={<Layout />}>
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
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                  <KeyboardShortcuts />
                </BrowserRouter>
              </OrderProvider>
            </POSProvider>
          </InventoryProvider>
        </SettingsProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
