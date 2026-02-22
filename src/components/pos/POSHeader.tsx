interface POSHeaderProps {
  warehouseName: string;
  search: string;
  cartCount: number;
  onSearchChange: (value: string) => void;
  onWarehouseTap: () => void;
  onCartTap: () => void;
}

export default function POSHeader({
  warehouseName,
  search,
  cartCount,
  onSearchChange,
  onWarehouseTap,
  onCartTap,
}: POSHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={onWarehouseTap}
        className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
      >
        {warehouseName}
      </button>
      <div className="flex-1 relative">
        <input
          type="search"
          placeholder="Search products..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
          🔍
        </span>
      </div>
      <button
        type="button"
        onClick={onCartTap}
        className="relative shrink-0 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"
      >
        Cart
        {cartCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-slate-900">
            {cartCount > 99 ? '99+' : cartCount}
          </span>
        )}
      </button>
    </header>
  );
}
