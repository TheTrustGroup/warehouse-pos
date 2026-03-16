// src/components/layout/Header.tsx - EDK top bar: single search (no duplicate on pages), 56px, logout/notif
// Hidden on /pos so POS page uses its own topbar only.
import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Search, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { RealtimeSyncIndicator } from '../RealtimeSyncIndicator';

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();
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

  // POS has its own topbar; do not show layout header on POS
  if (location.pathname === '/pos') return null;

  return (
    <header
      className="fixed top-0 left-0 lg:left-[var(--edk-sidebar-w)] right-0 h-[var(--edk-topbar-h)] bg-[var(--edk-surface)] border-b border-[var(--edk-border)] flex items-center gap-3 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] lg:px-5 z-10"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Single top nav search: flex-1 max 520px, placeholder, ⌘K badge, focus ring */}
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
