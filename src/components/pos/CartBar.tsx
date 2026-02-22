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
      className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
    >
      <span className="font-semibold text-slate-800">
        {count} item{count !== 1 ? 's' : ''}
      </span>
      <span className="text-lg font-bold text-primary-600">
        GH₵{Number(total).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
