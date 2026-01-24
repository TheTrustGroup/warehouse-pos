import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './contexts/SettingsContext';
import { InventoryProvider } from './contexts/InventoryContext';
import { POSProvider } from './contexts/POSContext';
import { ToastProvider } from './contexts/ToastContext';
import { Layout } from './components/layout/Layout';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { KeyboardShortcuts } from './components/ui/KeyboardShortcuts';

// Lazy load pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const POS = lazy(() => import('./pages/POS').then(m => ({ default: m.POS })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));

// Placeholder pages (will be built in next prompts)
const Users = () => <div className="card"><h2 className="text-2xl font-bold">Users</h2></div>;

function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <InventoryProvider>
          <POSProvider>
            <BrowserRouter>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="inventory" element={<Inventory />} />
                    <Route path="pos" element={<POS />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="users" element={<Users />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
                </Routes>
              </Suspense>
              <KeyboardShortcuts />
            </BrowserRouter>
          </POSProvider>
        </InventoryProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}

export default App;
