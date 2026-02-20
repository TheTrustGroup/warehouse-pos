// ============================================================
// CartBar.tsx
// File: warehouse-pos/src/components/pos/CartBar.tsx
//
// Sticky footer bar. Always visible.
// Shows item count + running total.
// Inactive (greyed) when cart is empty.
// Pulses briefly when an item is added.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { type CartLine } from './CartSheet';

// ── Types ──────────────────────────────────────────────────────────────────

interface CartBarProps {
  lines: CartLine[];
  onOpen: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Icon ───────────────────────────────────────────────────────────────────

const IconCart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

const IconChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// ── Main Component ─────────────────────────────────────────────────────────

export default function CartBar({ lines, onOpen }: CartBarProps) {

  const itemCount  = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal   = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const isEmpty    = itemCount === 0;

  // ── Pulse animation when item added ──────────────────────────────────────
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    if (itemCount > prevCount.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="
      fixed bottom-0 left-0 right-0 z-30
      px-4 py-3
      bg-white border-t border-slate-100
      shadow-[0_-4px_24px_rgba(0,0,0,0.07)]
    ">
      <button
        type="button"
        onClick={onOpen}
        disabled={isEmpty}
        className={`
          w-full h-14 rounded-2xl
          flex items-center justify-between
          px-4
          font-sans
          transition-all duration-200
          disabled:cursor-not-allowed
          active:scale-[0.98]
          ${isEmpty
            ? 'bg-slate-100 text-slate-400'
            : `bg-red-500 hover:bg-red-600 text-white
               ${pulse ? 'scale-[1.02] shadow-[0_6px_20px_rgba(239,68,68,0.4)]' : 'shadow-[0_4px_14px_rgba(239,68,68,0.25)]'}`
          }
        `}
      >
        {/* Left: cart icon + item count badge + label */}
        <div className="flex items-center gap-3">
          {/* Count badge */}
          <div className={`
            w-8 h-8 rounded-xl flex items-center justify-center
            text-[14px] font-extrabold
            transition-colors duration-200
            ${isEmpty
              ? 'bg-slate-200 text-slate-400'
              : 'bg-white/20 text-white'
            }
          `}>
            {isEmpty ? <IconCart /> : itemCount}
          </div>

          <span className={`
            text-[15px] font-bold
            ${isEmpty ? 'text-slate-400' : 'text-white'}
          `}>
            {isEmpty ? 'Cart is empty' : `View cart`}
          </span>
        </div>

        {/* Right: total + chevron */}
        {!isEmpty && (
          <div className="flex items-center gap-1.5">
            <span className="text-[16px] font-extrabold text-white tabular-nums">
              {formatPrice(subtotal)}
            </span>
            <IconChevronRight />
          </div>
        )}
      </button>
    </div>
  );
}
