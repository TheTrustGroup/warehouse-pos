interface POSHeaderProps {
  warehouseName: string;
  search: string;
  cartCount: number;
  onSearchChange: (value: string) => void;
  onCartTap: () => void;
  /** Barcode scan: USB scanner types here and sends Enter. Optional. */
  barcodeValue?: string;
  onBarcodeChange?: (value: string) => void;
  onBarcodeSubmit?: () => void;
}

export default function POSHeader({
  warehouseName,
  search,
  cartCount,
  onSearchChange,
  onCartTap,
  barcodeValue = '',
  onBarcodeChange,
  onBarcodeSubmit,
}: POSHeaderProps) {
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onBarcodeSubmit) {
      e.preventDefault();
      onBarcodeSubmit();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-3">
      <span
        className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
        aria-label={`Location: ${warehouseName}`}
      >
        {warehouseName}
      </span>
      {onBarcodeChange != null && onBarcodeSubmit != null && (
        <div className="flex shrink-0 items-center gap-2 sm:w-48">
          <label htmlFor="pos-barcode-input" className="hidden sm:inline-block shrink-0 text-xs font-medium text-slate-500">
            Scan
          </label>
          <input
            id="pos-barcode-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Scan barcode"
            value={barcodeValue}
            onChange={(e) => onBarcodeChange(e.target.value)}
            onKeyDown={handleBarcodeKeyDown}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-2 text-sm placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            aria-label="Barcode scan"
          />
        </div>
      )}
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
