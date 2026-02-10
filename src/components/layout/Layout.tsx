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
      {/* Main: consistent padding (block rhythm), no horizontal scroll on small viewports */}
      <main className="lg:ml-[280px] mt-[72px] pt-20 lg:pt-8 px-4 lg:px-8 pb-8 min-h-[calc(100vh-72px)] max-w-[1600px]">
        <Outlet />
      </main>
    </div>
  );
}
