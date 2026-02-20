// ============================================================
// POSHeader.tsx
// File: warehouse-pos/src/components/pos/POSHeader.tsx
//
// Sticky top header for the POS page.
// - Brand mark + active warehouse badge (tap to switch)
// - Search input (scan or type)
// - Cart item count badge (secondary entry point to cart)
// ============================================================

import { useRef, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface POSHeaderProps {
  warehouseName: string;
  search: string;
  cartCount: number;
  onSearchChange: (val: string) => void;
  onWarehouseTap: () => void;   // triggers session screen / warehouse switcher
  onCartTap: () => void;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconChevron = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const IconCart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

// ── Main Component ─────────────────────────────────────────────────────────

export default function POSHeader({
  warehouseName,
  search,
  cartCount,
  onSearchChange,
  onWarehouseTap,
  onCartTap,
}: POSHeaderProps) {

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on mount — cashier can start typing/scanning immediately
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  // Re-focus after clearing
  function handleClear() {
    onSearchChange('');
    inputRef.current?.focus();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <header className="
      sticky top-0 z-20
      bg-white border-b border-slate-100
      shadow-[0_1px_0_rgba(0,0,0,0.04)]
    ">
      {/* Top row: brand + warehouse + cart */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">

        {/* Brand mark */}
        <div className="flex items-center gap-2.5">
          <div className="
            w-8 h-8 rounded-[10px] bg-red-500
            flex items-center justify-center
            text-white text-[13px] font-extrabold
            flex-shrink-0
          ">
            E
          </div>
          <span className="text-[15px] font-bold text-slate-900 leading-none">
            POS
          </span>
        </div>

        {/* Right side: warehouse badge + cart */}
        <div className="flex items-center gap-2">

          {/* Warehouse badge — tap to switch */}
          <button
            type="button"
            onClick={onWarehouseTap}
            className="
              flex items-center gap-1.5
              h-8 px-3 rounded-full
              bg-slate-100 hover:bg-slate-200
              border border-transparent
              font-sans text-[12px] font-semibold text-slate-600
              transition-all duration-150
              active:scale-95
            "
          >
            {/* Live dot */}
            <span className="
              w-1.5 h-1.5 rounded-full bg-emerald-500
              shadow-[0_0_0_2px_rgba(16,185,129,0.2)]
            " />
            <span>{warehouseName}</span>
            <IconChevron />
          </button>

          {/* Cart count button */}
          <button
            type="button"
            onClick={onCartTap}
            disabled={cartCount === 0}
            className="
              relative w-10 h-10 rounded-xl
              bg-slate-50 border border-slate-200
              text-slate-500
              flex items-center justify-center
              hover:bg-slate-100 hover:text-slate-700
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-95
              transition-all duration-150
            "
            aria-label={`Cart — ${cartCount} items`}
          >
            <IconCart />
            {cartCount > 0 && (
              <span className="
                absolute -top-1.5 -right-1.5
                min-w-[18px] h-[18px] px-1
                rounded-full bg-red-500 text-white
                text-[10px] font-extrabold
                flex items-center justify-center
                tabular-nums leading-none
                shadow-[0_0_0_2px_white]
              ">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search row */}
      <div className="px-4 pb-3">
        <div className="relative">
          {/* Search icon */}
          <span className="
            absolute left-3.5 top-1/2 -translate-y-1/2
            text-slate-400 pointer-events-none
          ">
            <IconSearch />
          </span>

          <input
            ref={inputRef}
            type="search"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search or scan barcode…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="
              w-full h-11 pl-10 pr-10
              rounded-xl border-[1.5px] border-slate-200
              bg-slate-50 text-[14px] text-slate-900
              placeholder:text-slate-300
              focus:outline-none focus:border-red-400
              focus:bg-white focus:ring-[3px] focus:ring-red-100
              transition-all duration-150
            "
          />

          {/* Clear button */}
          {search && (
            <button
              type="button"
              onClick={handleClear}
              className="
                absolute right-3 top-1/2 -translate-y-1/2
                w-6 h-6 rounded-full
                bg-slate-200 text-slate-500
                flex items-center justify-center
                hover:bg-slate-300
                transition-colors duration-150
              "
            >
              <IconX />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
