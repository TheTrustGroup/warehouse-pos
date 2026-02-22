export interface Warehouse {
  id: string;
  name: string;
  code?: string;
}

interface SessionScreenProps {
  isOpen: boolean;
  warehouses: Warehouse[];
  activeWarehouseId: string;
  onSelect: (warehouse: Warehouse) => void;
}

export default function SessionScreen({
  isOpen,
  warehouses,
  activeWarehouseId,
  onSelect,
}: SessionScreenProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Select location</h2>
        <ul className="space-y-2">
          {warehouses.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onSelect(w)}
                className={`w-full rounded-xl px-4 py-3 text-left font-medium transition ${
                  w.id === activeWarehouseId
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {w.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
