import { useState } from 'react';

/**
 * POS product shape. Inventory Product (from useInventory) passed into POS views
 * (ProductGrid, ProductSearch) must be compatible: id, name, sku, quantity,
 * sellingPrice, category?, sizeKind?, quantityBySize?, images?. Keep in sync when changing either type.
 */
export interface POSProduct {
  id: string;
  name: string;
  sku: string;
  sizeKind?: 'na' | 'one_size' | 'sized';
  quantity: number;
  quantityBySize?: Array<{ sizeCode: string; sizeLabel?: string; quantity: number }>;
  sellingPrice: number;
  category?: string;
  images?: string[];
  /** For POS filters (size, color) — API may send as top-level. */
  color?: string | null;
  barcode?: string | null;
}

export interface CartLineInput {
  productId: string;
  name: string;
  sku?: string;
  sizeCode?: string | null;
  sizeLabel?: string | null;
  unitPrice: number;
  qty: number;
  /** Product image URL (e.g. first of product.images) for receipt / API. */
  imageUrl?: string | null;
}

interface SizePickerSheetProps {
  product: POSProduct | null;
  onAdd: (input: CartLineInput) => void;
  onClose: () => void;
}

export default function SizePickerSheet({ product, onAdd, onClose }: SizePickerSheetProps) {
  const [qty, setQty] = useState(1);

  if (!product) return null;

  const isSized = product.sizeKind === 'sized' && (product.quantityBySize?.length ?? 0) > 0;
  const sizes = product.quantityBySize ?? [];

  const handleAdd = (sizeCode: string | null, sizeLabel: string | null) => {
    onAdd({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      sizeCode: sizeCode ?? undefined,
      sizeLabel: sizeLabel ?? undefined,
      unitPrice: product.sellingPrice,
      qty,
      imageUrl: product.images?.[0] ?? null,
    });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h3 className="font-semibold text-slate-900">{product.name}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="p-4">
          <div className="mb-4 flex items-center gap-4">
            <span className="text-sm text-slate-600">Qty</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="h-9 w-9 rounded-lg border border-slate-200 bg-slate-50 font-medium"
              >
                −
              </button>
              <span className="w-8 text-center font-medium">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((n) => n + 1)}
                className="h-9 w-9 rounded-lg border border-slate-200 bg-slate-50 font-medium"
              >
                +
              </button>
            </div>
          </div>
          {isSized ? (
            <div className="grid grid-cols-3 gap-2">
              {sizes.map((row) => (
                <button
                  key={row.sizeCode}
                  type="button"
                  disabled={row.quantity <= 0}
                  onClick={() => handleAdd(row.sizeCode, row.sizeLabel ?? null)}
                  className="rounded-xl border border-slate-200 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:border-primary-400 hover:bg-primary-50"
                >
                  <span className="block">{row.sizeLabel ?? row.sizeCode}</span>
                  <span className="text-xs text-slate-500">Stock: {row.quantity}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleAdd(null, null)}
              className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white"
            >
              Add to cart — GH₵{(product.sellingPrice * qty).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
