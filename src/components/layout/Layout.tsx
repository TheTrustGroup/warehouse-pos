import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { getApiCircuitBreaker } from '../../lib/observability';

export function Layout() {
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    const circuit = getApiCircuitBreaker();
    const check = () => setDegraded(circuit.isDegraded());
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {degraded && (
        <div className="bg-amber-500 text-amber-950 text-center py-2 px-4 text-sm font-medium">
          Server temporarily unavailable. Showing last saved data. Changes will sync when the server is back.
        </div>
      )}
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Menu */}
      <MobileMenu />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="lg:ml-[280px] mt-[72px] pt-20 lg:pt-8 p-4 lg:p-8 min-h-[calc(100vh-72px)]">
        <Outlet />
      </main>
    </div>
  );
}
