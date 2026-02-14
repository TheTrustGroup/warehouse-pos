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

  const handleTryAgain = () => {
    const circuit = getApiCircuitBreaker();
    circuit.reset();
    setDegraded(false);
    window.dispatchEvent(new CustomEvent('circuit-retry'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <MobileMenu />
      <Header />
      {/* In-flow banner: reserves layout space so content is never overlapped. Pushes main content down. */}
      {degraded && (
        <div
          className="lg:ml-[280px] mt-[calc(72px+var(--safe-top))] bg-amber-500 text-amber-950 text-center py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-3 flex-wrap min-h-[3rem] border-b border-amber-600/20"
          role="status"
        >
          <span>Server temporarily unavailable. Showing last saved data. Changes will sync when the server is back.</span>
          <button
            type="button"
            onClick={handleTryAgain}
            className="underline font-semibold hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-800 rounded min-h-touch"
          >
            Try again
          </button>
        </div>
      )}
      <main
        className={`lg:ml-[280px] pt-20 lg:pt-8 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] lg:px-8 pb-[max(2rem,var(--safe-bottom))] min-h-[calc(100vh-72px)] max-w-[1600px] overflow-x-hidden ${
          degraded ? 'mt-0' : 'mt-[calc(72px+var(--safe-top))]'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
