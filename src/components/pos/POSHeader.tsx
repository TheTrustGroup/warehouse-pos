import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface POSHeaderProps {
  warehouseName: string;
  search: string;
  cartCount: number;
  onSearchChange: (value: string) => void;
  onCartTap: () => void;
  /** Barcode: when user presses Enter in search, this is called with current value (single input for search + scan). */
  onBarcodeSubmit?: () => void;
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function POSHeader({
  warehouseName,
  search,
  cartCount,
  onSearchChange,
  onCartTap,
  onBarcodeSubmit,
}: POSHeaderProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onBarcodeSubmit && search.trim()) {
      e.preventDefault();
      onBarcodeSubmit();
    }
  };

  return (
    <header
      className="sticky top-0 z-30 h-[var(--edk-topbar-h)] flex items-center gap-2 sm:gap-3 border-b border-[var(--edk-border)] bg-[var(--edk-surface)] px-3 sm:px-4"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <span
        className="shrink-0 flex items-center gap-1.5 h-[30px] px-2.5 rounded-[var(--edk-radius-sm)] bg-[var(--edk-green-bg)] border border-[rgba(22,163,74,0.2)] text-[12px] font-semibold text-[var(--edk-green)]"
        aria-label={`Location: ${warehouseName}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--edk-green)]" aria-hidden />
        {warehouseName}
      </span>
      <div className="flex-1 min-w-0 relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--edk-ink-3)]" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <input
          type="search"
          placeholder="Search products or scan barcode…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-[34px] pl-9 pr-[72px] rounded-lg bg-[var(--edk-bg)] border border-[var(--edk-border-mid)] text-[13px] text-[var(--edk-ink)] placeholder:text-[var(--edk-ink-3)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--edk-red-border)] focus:shadow-[0_0_0_3px_var(--edk-red-soft)]"
          aria-label="Search products or scan barcode"
        />
        <button
          type="button"
          onClick={onBarcodeSubmit}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded bg-[var(--edk-ink)] text-white text-[10px] font-bold uppercase tracking-wider"
        >
          Scan
        </button>
      </div>
      <button
        type="button"
        onClick={onCartTap}
        className="relative shrink-0 h-[34px] px-3.5 rounded-[var(--edk-radius-sm)] bg-[var(--edk-red)] text-white text-[13px] font-semibold flex items-center gap-1.5 shadow-[0_1px_3px_rgba(232,40,26,0.3)]"
      >
        Cart
        {cartCount > 0 && (
          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-white text-[var(--edk-red)] text-[10px] font-extrabold px-1">
            {cartCount > 99 ? '99+' : cartCount}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="relative w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] hover:bg-[var(--edk-bg)] text-[var(--edk-ink-2)]"
          aria-label="Notifications"
        >
          <BellIcon />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[var(--edk-red)] rounded-full ring-[1.5px] ring-white" aria-hidden />
        </button>
        <POSHeaderLogout />
      </div>
    </header>
  );
}

function POSHeaderLogout() {
  const [loggingOut, setLoggingOut] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] hover:bg-[var(--edk-bg)] text-[var(--edk-ink-2)] text-[12px] font-medium disabled:opacity-60"
    >
      <LogOutIcon />
      Log out
    </button>
  );
}
