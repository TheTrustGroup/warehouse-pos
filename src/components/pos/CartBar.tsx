export interface CartLine {
  key: string;
  productId: string;
  name: string;
  sku: string;
  sizeCode: string | null;
  sizeLabel: string | null;
  unitPrice: number;
  qty: number;
}

interface CartBarProps {
  lines: CartLine[];
  onOpen: () => void;
}

function fmt(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CartBar({ lines, onOpen }: CartBarProps) {
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  if (count === 0) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-3 border-t border-[var(--edk-border)] bg-[var(--edk-surface)] px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] safe-area-pb"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <span className="text-[13px] font-semibold text-[var(--edk-ink)] min-w-0 truncate">
        {count} item{count !== 1 ? 's' : ''}
      </span>
      <span className="text-[18px] font-extrabold text-[var(--edk-red)] flex-shrink-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        {fmt(total)}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className="min-h-[44px] min-w-[44px] flex-shrink-0 px-4 rounded-[var(--edk-radius-sm)] bg-[var(--edk-red)] text-white text-[13px] font-bold touch-manipulation"
      >
        View Cart
      </button>
    </div>
  );
}
