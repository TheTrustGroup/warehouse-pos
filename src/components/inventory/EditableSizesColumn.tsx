import { useMemo } from 'react';
import type { SizeInventoryItem } from '../../types';

/** Single size badge with quantity input and delete button. */
function EditableBadge({
  size,
  onQuantityChange,
  onDelete,
}: {
  size: SizeInventoryItem;
  onQuantityChange: (sizeCode: string, quantity: number) => void;
  onDelete: (sizeCode: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-sm font-medium shrink-0">
      <span>{size.size_code}</span>
      <input
        type="number"
        min={0}
        value={size.quantity}
        onChange={(e) => onQuantityChange(size.size_code, Number(e.target.value))}
        className="w-12 px-1.5 py-0.5 text-center rounded border border-slate-300 bg-white text-slate-800 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        aria-label={`Quantity for ${size.size_code}`}
      />
      <button
        type="button"
        onClick={() => onDelete(size.size_code)}
        className="ml-0.5 -mr-0.5 p-0.5 rounded border-0 bg-transparent cursor-pointer font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 min-w-touch min-h-touch"
        aria-label={`Remove size ${size.size_code}`}
      >
        ×
      </button>
    </span>
  );
}

export interface EditableSizesColumnProps {
  /** Current product (needs id). */
  product: { id: string };
  /** Currently selected warehouse id. */
  selectedWarehouse: string;
  /** Full array of warehouse_inventory_by_size–style rows. */
  sizeInventory: SizeInventoryItem[];
  /** Updater for size inventory (e.g. React setState). */
  setSizeInventory: React.Dispatch<React.SetStateAction<SizeInventoryItem[]>>;
}

/**
 * Editable sizes column: shows each size with quantity input and delete.
 * Updates local state via setSizeInventory; parent is responsible for persisting.
 */
export function EditableSizesColumn({
  product,
  selectedWarehouse,
  sizeInventory,
  setSizeInventory,
}: EditableSizesColumnProps) {
  const productSizes = useMemo(() => {
    return sizeInventory
      .filter(
        (row) =>
          row.product_id === product.id && row.warehouse_id === selectedWarehouse
      )
      .sort((a, b) => a.size_codes.size_order - b.size_codes.size_order);
  }, [product.id, selectedWarehouse, sizeInventory]);

  const handleQuantityChange = (sizeCode: string, quantity: number) => {
    setSizeInventory((prev) =>
      prev.map((row) =>
        row.product_id === product.id &&
        row.warehouse_id === selectedWarehouse &&
        row.size_code === sizeCode
          ? { ...row, quantity }
          : row
      )
    );
  };

  const handleDelete = (sizeCode: string) => {
    setSizeInventory((prev) =>
      prev.filter(
        (row) =>
          !(
            row.product_id === product.id &&
            row.warehouse_id === selectedWarehouse &&
            row.size_code === sizeCode
          )
      )
    );
  };

  if (productSizes.length === 0) {
    return (
      <span className="text-slate-400 text-sm min-h-[40px] inline-flex items-center">
        No sizes in stock
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 min-h-[40px] items-center">
      {productSizes.map((size) => (
        <EditableBadge
          key={size.size_code}
          size={size}
          onQuantityChange={handleQuantityChange}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
