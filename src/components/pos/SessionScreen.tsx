// ============================================================
// SessionScreen.tsx
// File: warehouse-pos/src/components/pos/SessionScreen.tsx
//
// Full-screen warehouse selector shown when:
// - POS first loads
// - Cashier taps the warehouse badge to switch location
//
// Dark theme — distinct from the POS so staff know
// they're in "setup mode" not selling mode.
// ============================================================

// ── Types ──────────────────────────────────────────────────────────────────

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  productCount?: number;
  totalStock?: number;
}

interface SessionScreenProps {
  isOpen: boolean;
  warehouses: Warehouse[];
  activeWarehouseId?: string;
  onSelect: (warehouse: Warehouse) => void;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconArrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconWarehouse = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

// ── Warehouse Card ─────────────────────────────────────────────────────────

interface WarehouseCardProps {
  warehouse: Warehouse;
  isActive: boolean;
  onSelect: () => void;
}

function WarehouseCard({ warehouse, isActive, onSelect }: WarehouseCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full text-left
        px-5 py-4 rounded-2xl
        border-[1.5px]
        flex items-center justify-between gap-4
        transition-all duration-200
        active:scale-[0.98]
        ${isActive
          ? 'bg-red-500 border-red-500 shadow-[0_8px_24px_rgba(239,68,68,0.3)]'
          : 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-700'
        }
      `}
    >
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className={`
          w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0
          ${isActive ? 'bg-white/20' : 'bg-slate-700'}
        `}>
          <span className={isActive ? 'text-white' : 'text-slate-400'}>
            <IconWarehouse />
          </span>
        </div>

        {/* Info */}
        <div>
          <p className={`
            text-[16px] font-bold leading-tight
            ${isActive ? 'text-white' : 'text-slate-100'}
          `}>
            {warehouse.name}
          </p>
          <p className={`
            text-[12px] font-medium mt-0.5
            ${isActive ? 'text-white/70' : 'text-slate-500'}
          `}>
            {warehouse.productCount != null
              ? `${warehouse.productCount} products · ${warehouse.totalStock ?? 0} units`
              : warehouse.code
            }
          </p>
        </div>
      </div>

      {/* Right indicator */}
      <div className={`
        flex-shrink-0
        ${isActive ? 'text-white' : 'text-slate-600'}
      `}>
        {isActive ? <IconCheck /> : <IconArrow />}
      </div>
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SessionScreen({
  isOpen,
  warehouses,
  activeWarehouseId,
  onSelect,
}: SessionScreenProps) {

  return (
    <div
      className={`
        fixed inset-0 z-50
        bg-slate-900
        flex flex-col items-center justify-center
        px-6 py-12
        transition-all duration-300
        ${isOpen
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none scale-[0.97]'
        }
      `}
    >
      {/* Logo */}
      <div className="
        w-14 h-14 rounded-[18px] bg-red-500
        flex items-center justify-center
        text-white text-[22px] font-extrabold
        mb-6
        shadow-[0_8px_24px_rgba(239,68,68,0.4)]
      ">
        E
      </div>

      {/* Title */}
      <h1 className="text-[26px] font-extrabold text-white text-center leading-tight mb-2">
        Extreme Dept Kidz
      </h1>
      <p className="text-[14px] text-slate-400 text-center mb-10">
        Select your store to start selling
      </p>

      {/* Warehouse list */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest text-center mb-1">
          Warehouse / Location
        </p>

        {warehouses.map(w => (
          <WarehouseCard
            key={w.id}
            warehouse={w}
            isActive={w.id === activeWarehouseId}
            onSelect={() => onSelect(w)}
          />
        ))}
      </div>

      {/* Footer */}
      <p className="
        absolute bottom-8
        text-[11px] text-slate-700 font-medium text-center
      ">
        Tap your location to begin
      </p>
    </div>
  );
}
