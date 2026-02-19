import { useMemo } from 'react';
import type { SizeInventoryItem } from '../../types';

export interface SizeBadgeProps {
  sizeCode: string;
  quantity: number;
}

/** Single size badge showing size code and quantity (no delete button). */
export function SizeBadge({ sizeCode, quantity }: SizeBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-sm font-medium shrink-0">
      <span>{sizeCode}</span>
      <span className="text-slate-500 font-normal tabular-nums">{quantity}</span>
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
}

/**
 * Sizes column cell: shows size badges (size code + quantity) for this product at the selected warehouse (quantity > 0, sorted by size_order).
 */
export function SizesColumn({ product, selectedWarehouse, sizeInventory }: SizesColumnProps) {
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
        <SizeBadge
          key={size.size_code}
          sizeCode={size.size_code}
          quantity={size.quantity}
        />
      ))}
    </div>
  );
}
