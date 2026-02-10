import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { getApiCircuitBreaker } from '../../lib/observability';

/** Layout: single vertical rhythm — section spacing (24px) and consistent main padding. Mobile-first. */
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
        <div className="bg-amber-500 text-amber-950 text-center py-2.5 px-4 text-sm font-medium" role="status">
          Server temporarily unavailable. Showing last saved data. Changes will sync when the server is back.
        </div>
      )}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <MobileMenu />
      <Header />
      {/* Main: clear fixed header (72px + safe-area), safe-area padding, no horizontal scroll */}
      <main className="lg:ml-[280px] mt-[calc(72px+var(--safe-top))] pt-20 lg:pt-8 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] lg:px-8 pb-[max(2rem,var(--safe-bottom))] min-h-[calc(100vh-72px)] max-w-[1600px] overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
