// src/components/layout/Header.tsx - EDK top bar; mobile: compact 52px (search icon, LIVE, bell, cart). Hidden on /pos.
import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { Search, Bell, LogOut, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { RealtimeSyncIndicator } from '../RealtimeSyncIndicator';
import { useRealtimeStatus } from '../../contexts/RealtimeContext';

const MOBILE_BREAKPOINT = 768;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

function getPageTitle(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/inventory')) return 'Inventory';
  if (pathname.startsWith('/sales')) return 'Sales';
  if (pathname.startsWith('/orders')) return 'Orders';
  if (pathname.startsWith('/deliveries')) return 'Deliveries';
  if (pathname.startsWith('/reports')) return 'Reports';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/users')) return 'Users';
  return 'App';
}

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();
  const isMobile = useIsMobile();
  const realtimeStatus = useRealtimeStatus();
  const isInventory = location.pathname === '/inventory';
  const qFromUrl = isInventory ? (searchParams.get('q') ?? '') : '';
  const [searchQuery, setSearchQuery] = useState(qFromUrl);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (isInventory) setSearchQuery(qFromUrl);
  }, [isInventory, qFromUrl]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };
  const logoutButtonLabel = isLoggingOut ? 'Signing out…' : 'Log out';

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      navigate(`/inventory?q=${encodeURIComponent(q)}`);
      setSearchParams({ q });
    }
  };

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (isInventory) {
      if (value.trim()) setSearchParams({ q: value.trim() }, { replace: true });
      else setSearchParams({}, { replace: true });
    }
  };

  if (location.pathname === '/pos') return null;

  // Mobile topbar (max-width: 768px): 52px, page title, search icon, LIVE pill, bell, cart
  if (isMobile) {
    const hasNotif = false;
    return (
      <header
        className="md:hidden fixed top-0 left-0 right-0 h-[52px] bg-white border-b border-[#E0DED8] flex items-center px-4 gap-2 z-10"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <span className="flex-1 text-[13px] font-medium text-[#1A1916] truncate">
          {getPageTitle(location.pathname)}
        </span>
        <button
          type="button"
          onClick={() => navigate('/inventory')}
          className="w-8 h-8 rounded-lg bg-[#EEEDE9] flex items-center justify-center"
          aria-label="Search products"
        >
          <Search size={14} className="text-[#6B6860]" />
        </button>
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
            realtimeStatus === 'connected'
              ? 'bg-[#E8F7EF] text-[#12A05C]'
              : realtimeStatus === 'connecting'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-[#EEEDE9] text-[#6B6860]'
          }`}
        >
          <div
            className={`w-[5px] h-[5px] rounded-full ${
              realtimeStatus === 'connected'
                ? 'bg-[#12A05C]'
                : realtimeStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-[#6B6860]'
            }`}
          />
          {realtimeStatus === 'connected' ? 'LIVE' : realtimeStatus === 'connecting' ? '…' : 'Offline'}
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-[#EEEDE9] relative flex items-center justify-center"
          aria-label="Notifications"
        >
          <Bell size={14} className="text-[#6B6860]" />
          {hasNotif && (
            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
          )}
        </button>
        <Link
          to="/pos"
          className="w-8 h-8 rounded-lg bg-[#1B6FE8] flex items-center justify-center"
          aria-label="Open POS"
        >
          <ShoppingCart size={14} className="text-white" />
        </Link>
      </header>
    );
  }

  // Desktop (min-width: 768px): unchanged
  return (
    <header
      className="hidden md:flex fixed top-0 left-0 lg:left-[var(--edk-sidebar-w)] right-0 h-[var(--edk-topbar-h)] bg-[var(--edk-surface)] border-b border-[var(--edk-border)] items-center gap-3 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] lg:px-5 z-10"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="flex-1 max-w-[520px] relative">
        <form onSubmit={handleSearch} className="relative group">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--edk-ink-3)] group-focus-within:text-[var(--edk-red)] pointer-events-none" strokeWidth={2} aria-hidden />
          <input
            type="search"
            inputMode="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search products, SKU, or barcode…"
            className="w-full h-[32px] pl-8 pr-14 rounded-md bg-[var(--edk-bg)] border border-[var(--edk-border-mid)] text-[12px] text-[var(--edk-ink)] placeholder:text-[var(--edk-ink-3)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--edk-red-border)] focus:shadow-[0_0_0_2px_var(--edk-red-soft)]"
            aria-label="Search products, SKU, or barcode"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--edk-ink-3)] bg-[var(--edk-surface-2)] border border-[var(--edk-border-mid)] rounded px-1.5 py-0.5 pointer-events-none" aria-hidden>⌘K</span>
        </form>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        <RealtimeSyncIndicator />
        <Button
          type="button"
          variant="secondary"
          onClick={handleLogout}
          loading={isLoggingOut}
          leftIcon={!isLoggingOut ? <LogOut className="w-3.5 h-3.5" strokeWidth={2} /> : undefined}
          className="h-[32px] px-2.5 rounded-md border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] hover:bg-[var(--edk-bg)] text-[var(--edk-ink-2)] text-[11px] font-medium min-w-[40px] touch-manipulation"
          title="Log out"
          aria-label={logoutButtonLabel}
        >
          <span className="hidden sm:inline">{logoutButtonLabel}</span>
        </Button>
        <Button
          type="button"
          variant="action"
          className="relative w-[32px] h-[32px] flex items-center justify-center rounded-md border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] hover:bg-[var(--edk-bg)] text-[var(--edk-ink-2)] disabled:opacity-50 touch-manipulation"
          aria-label="View notifications"
          title="Notifications"
          disabled
        >
          <Bell className="w-3.5 h-3.5" strokeWidth={2} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[var(--edk-red)] rounded-full ring-[1.5px] ring-white" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
