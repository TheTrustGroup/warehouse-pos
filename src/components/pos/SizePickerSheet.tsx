import { useState, useCallback, useMemo } from 'react';
import { Check, ShoppingCart } from 'lucide-react';

/**
 * POS product shape. Inventory Product (from useInventory) passed into POS views
 * must be compatible: id, name, sku, quantity, sellingPrice, category?, sizeKind?,
 * quantityBySize?, images?. Keep in sync when changing either type.
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
  imageUrl?: string | null;
}

const BOTTOM_NAV_HEIGHT_PX = 64;

interface SizeRowProps {
  variant: { sizeCode: string; sizeLabel?: string; quantity: number };
  selected: boolean;
  qty: number;
  onToggle: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
}

function SizeRow({ variant, selected, qty, onToggle, onDecrement, onIncrement }: SizeRowProps) {
  const sizeLabel = variant.sizeLabel ?? variant.sizeCode;
  const stock = variant.quantity;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`flex items-center px-3 py-2.5 rounded-lg mb-1.5 cursor-pointer select-none transition-colors ${
        selected
          ? 'border-[1.5px] border-[#1B6FE8] bg-[#EBF2FD]'
          : 'border border-[#E0DED8] bg-white'
      }`}
    >
      <div
        className={`w-[18px] h-[18px] rounded-[4px] mr-2.5 flex-shrink-0 flex items-center justify-center ${
          selected ? 'bg-[#1B6FE8] border-[#1B6FE8]' : 'border border-[#C8C6BE]'
        }`}
      >
        {selected && <Check size={9} color="white" strokeWidth={2.5} />}
      </div>
      <span className="text-[14px] font-semibold text-[#1A1916] min-w-[36px]">{sizeLabel}</span>
      <span className="text-[12px] text-[#9B9890] flex-1 ml-1.5">{stock} left</span>
      {selected && (
        <div
          className="flex items-center bg-[#EEEDE9] rounded-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-[30px] h-[30px] flex items-center justify-center text-base text-[#3A3832] active:bg-[#E0DED8]"
            onClick={onDecrement}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="min-w-[24px] text-center text-[13px] font-semibold text-[#1A1916]">
            {qty}
          </span>
          <button
            type="button"
            className={`w-[30px] h-[30px] flex items-center justify-center text-base active:bg-[#E0DED8] ${
              qty >= stock ? 'text-[#C8C6BE] cursor-not-allowed' : 'text-[#3A3832]'
            }`}
            disabled={qty >= stock}
            onClick={onIncrement}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

interface SizePickerSheetProps {
  product: POSProduct | null;
  onAdd: (input: CartLineInput) => void;
  onClose: () => void;
}

export default function SizePickerSheet({ product, onAdd, onClose }: SizePickerSheetProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [qtyBySize, setQtyBySize] = useState<Record<string, number>>({});

  const variants = useMemo(() => product?.quantityBySize ?? [], [product]);

  const toggleVariant = useCallback((sizeCode: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sizeCode)) {
        next.delete(sizeCode);
        return next;
      }
      next.add(sizeCode);
      return next;
    });
    setQtyBySize((prev) => {
      const next = { ...prev };
      if (!next[sizeCode]) next[sizeCode] = 1;
      return next;
    });
  }, []);

  const setVariantQty = useCallback((sizeCode: string, delta: number) => {
    setQtyBySize((prev) => {
      const current = prev[sizeCode] ?? 1;
      const variant = variants.find((v) => v.sizeCode === sizeCode);
      const max = variant?.quantity ?? 1;
      const next = Math.max(1, Math.min(max, current + delta));
      return { ...prev, [sizeCode]: next };
    });
  }, [variants]);

  if (!product) return null;

  const isSized =
    (product.sizeKind === 'sized' ||
      (Array.isArray(product.quantityBySize) && (product.quantityBySize?.length ?? 0) > 1)) &&
    (product.quantityBySize?.length ?? 0) > 0;

  const selectedVariants = variants.filter((v) => selectedIds.has(v.sizeCode));
  const totalPrice = selectedVariants.reduce(
    (sum, v) => sum + product.sellingPrice * (qtyBySize[v.sizeCode] ?? 1),
    0
  );

  const handleAddToCart = () => {
    if (selectedVariants.length === 0) return;
    selectedVariants.forEach((v) => {
      const qty = qtyBySize[v.sizeCode] ?? 1;
      onAdd({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        sizeCode: v.sizeCode,
        sizeLabel: v.sizeLabel ?? v.sizeCode,
        unitPrice: product.sellingPrice,
        qty,
        imageUrl: product.images?.[0] ?? null,
      });
    });
    onClose();
  };

  // One-size / NA: single "Add to cart" with one qty (overlay still stops above bottom nav)
  if (!isSized) {
    return (
      <>
        <div
          className="fixed inset-x-0 top-0 z-40 bg-black/50"
          style={{ bottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}
          onClick={onClose}
          aria-hidden
        />
        <div
          className="fixed inset-x-0 top-0 z-50 flex flex-col justify-end bg-black/50"
          style={{ bottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}
        >
          <div
            className="bg-white rounded-t-[20px] flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-1 bg-[#E0DED8] rounded-full mx-auto mt-2.5 flex-shrink-0" />
            <div className="px-5 pt-3 pb-3 border-b border-[#EEEDE9] flex-shrink-0 flex items-start justify-between">
              <div>
                <h2 className="font-display text-[20px] tracking-[0.04em] leading-tight">
                  {product.name.toUpperCase()}
                </h2>
                <p className="text-[11px] text-[#9B9890] mt-0.5">{product.sku}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button
                  type="button"
                  className="w-6 h-6 rounded-full bg-[#EEEDE9] flex items-center justify-center text-[13px] text-[#6B6860]"
                  onClick={onClose}
                  aria-label="Close"
                >
                  ✕
                </button>
                <span className="font-display text-[22px] text-[#1B6FE8]">
                  GH₵{product.sellingPrice.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="p-5">
              <button
                type="button"
                onClick={() => {
                  onAdd({
                    productId: product.id,
                    name: product.name,
                    sku: product.sku,
                    sizeCode: null,
                    sizeLabel: null,
                    unitPrice: product.sellingPrice,
                    qty: 1,
                    imageUrl: product.images?.[0] ?? null,
                  });
                  onClose();
                }}
                className="w-full py-[14px] rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 bg-[#1B6FE8] text-white"
              >
                <ShoppingCart size={15} />
                Add to cart — GH₵
                {product.sellingPrice.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Overlay stops above bottom nav so nav stays visible and tappable */}
      <div
        className="fixed inset-x-0 top-0 z-50 flex flex-col justify-end bg-black/50"
        style={{ bottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}
      >
        <div
          className="bg-white rounded-t-[20px] flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-8 h-1 bg-[#E0DED8] rounded-full mx-auto mt-2.5 flex-shrink-0" />

          <div className="px-5 pt-3 pb-3 border-b border-[#EEEDE9] flex-shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-[20px] tracking-[0.04em] leading-tight">
                  {product.name.toUpperCase()}
                </h2>
                <p className="text-[11px] text-[#9B9890] mt-0.5">{product.sku}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button
                  type="button"
                  className="w-6 h-6 rounded-full bg-[#EEEDE9] flex items-center justify-center text-[13px] text-[#6B6860]"
                  onClick={onClose}
                  aria-label="Close"
                >
                  ✕
                </button>
                <span className="font-display text-[22px] text-[#1B6FE8]">
                  GH₵{product.sellingPrice.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <p className="px-5 pt-2.5 pb-1 text-[12px] text-[#9B9890] flex-shrink-0">
            Select sizes and quantity
          </p>

          <div className="flex-1 overflow-y-auto px-5 pt-1 pb-0 min-h-0">
            {variants.map((v) => (
              <SizeRow
                key={v.sizeCode}
                variant={v}
                selected={selectedIds.has(v.sizeCode)}
                qty={qtyBySize[v.sizeCode] ?? 1}
                onToggle={() => toggleVariant(v.sizeCode)}
                onDecrement={() => setVariantQty(v.sizeCode, -1)}
                onIncrement={() => setVariantQty(v.sizeCode, 1)}
              />
            ))}
          </div>

          <div className="flex-shrink-0 px-5 pt-3 pb-4 border-t border-[#EEEDE9] bg-white">
            <div className="flex flex-wrap gap-1.5 mb-2.5 min-h-[22px] items-center">
              {selectedVariants.map((v) => (
                <span
                  key={v.sizeCode}
                  className="bg-[#EBF2FD] text-[#1B6FE8] rounded-[5px] px-2 py-0.5 text-[11px] font-semibold"
                >
                  {v.sizeLabel ?? v.sizeCode} ×{qtyBySize[v.sizeCode] ?? 1}
                </span>
              ))}
              {selectedVariants.length > 0 && (
                <span className="text-[11px] text-[#9B9890] ml-1">
                  = GH₵{totalPrice.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={selectedVariants.length === 0}
              onClick={handleAddToCart}
              className={`w-full py-[14px] rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors ${
                selectedVariants.length > 0
                  ? 'bg-[#1B6FE8] text-white cursor-pointer'
                  : 'bg-[#EEEDE9] text-[#9B9890] cursor-not-allowed'
              }`}
            >
              <ShoppingCart size={15} />
              {selectedVariants.length > 0
                ? `Add to cart — GH₵${totalPrice.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
                : 'Select a size to add'}
            </button>
          </div>
        </div>
      </div>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        style={{ bottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}
        onClick={onClose}
        aria-hidden
      />
    </>
  );
}
