import { useMemo } from 'react';
import type { SizeInventoryItem } from '../../types';

export interface BadgeWithDeleteProps {
  sizeCode: string;
  onDelete?: (sizeCode: string) => void;
}

/** Single size badge with optional delete (×) button. */
export function BadgeWithDelete({ sizeCode, onDelete }: BadgeWithDeleteProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-sm font-medium shrink-0">
      <span>{sizeCode}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(sizeCode);
          }}
          className="ml-0.5 -mr-0.5 p-0.5 rounded border-0 bg-transparent cursor-pointer font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 min-w-touch min-h-touch"
          aria-label={`Remove size ${sizeCode}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export interface SizesColumnProps {
  /** Current product (needs id). */
  product: { id: string };
  /** Currently selected warehouse id. */
  selectedWarehouse: string;
  /** Full array of warehouse_inventory_by_size–style rows. Updates after deletes/edits when parent refetches. */
  sizeInventory: SizeInventoryItem[];
  /**
   * Called when user clicks × on a size. Parent should persist (e.g. update product quantityBySize and call updateProduct).
   * Signature: (productId, warehouseId, sizeCode) => void | Promise<void>
   */
  onDeleteSize?: (productId: string, warehouseId: string, sizeCode: string) => void;
}

/**
 * Sizes column cell: shows size badges for this product at the selected warehouse (quantity > 0, sorted by size_order).
 * Optional delete (×) on each badge triggers onDeleteSize for save/delete flow.
 */
export function SizesColumn({ product, selectedWarehouse, sizeInventory, onDeleteSize }: SizesColumnProps) {
  const productSizes = useMemo(() => {
    return sizeInventory
      .filter(
        (row) =>
          row.product_id === product.id &&
          row.warehouse_id === selectedWarehouse &&
          row.quantity > 0
      )
      .sort((a, b) => a.size_codes.size_order - b.size_codes.size_order);
  }, [product.id, selectedWarehouse, sizeInventory]);

  if (productSizes.length === 0) {
    return <span className="text-slate-400 text-sm min-h-[40px] inline-flex items-center">No sizes in stock</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5 min-h-[40px] items-center">
      {productSizes.map((size) => (
        <BadgeWithDelete
          key={size.size_code}
          sizeCode={size.size_code}
          onDelete={onDeleteSize ? (sizeCode) => onDeleteSize(product.id, selectedWarehouse, sizeCode) : undefined}
        />
      ))}
    </div>
  );
}
