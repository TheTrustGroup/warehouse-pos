/**
 * Extreme Dept Kidz–style product card: 16:9 image, badges, name, SKU, location,
 * price (inline editable), size pills or single qty, Edit + Quick stock footer.
 * Inline quick stock editor and inline price edit — no modal for stock/price.
 */

import { useState, useRef, useEffect } from 'react';
import { Product } from '../../types';
import { formatCurrency, getLocationDisplay } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Package, Pencil, Layers, MapPin } from 'lucide-react';

export interface InventoryCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onQuickStock: (productId: string) => void;
  onSaveStock: (productId: string, payload: { quantityBySize?: Array<{ sizeCode: string; quantity: number }>; quantity?: number }) => Promise<void>;
  onSavePrice?: (productId: string, sellingPrice: number) => Promise<void>;
  isQuickStockOpen: boolean;
  canEdit?: boolean;
  showCostPrice?: boolean;
}

function stockStatus(product: Product): { label: string; cls: string } {
  const qty = Number(product.quantity ?? 0) || 0;
  const reorder = Number(product.reorderLevel ?? 0) || 0;
  if (qty === 0) return { label: 'Out of stock', cls: 'out' };
  if (reorder > 0 && qty <= reorder) return { label: 'Low stock', cls: 'low' };
  return { label: 'In stock', cls: 'in' };
}

export function InventoryCard({
  product,
  onEdit,
  onQuickStock,
  onSaveStock,
  onSavePrice,
  isQuickStockOpen,
  canEdit = true,
  showCostPrice = true,
}: InventoryCardProps) {
  const [savingStock, setSavingStock] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [priceEditing, setPriceEditing] = useState(false);
  const [priceInputValue, setPriceInputValue] = useState(String(product.sellingPrice ?? 0));
  const priceInputRef = useRef<HTMLInputElement>(null);

  const status = stockStatus(product);
  const kind = (product.sizeKind ?? 'na') as string;
  const quantityBySize = Array.isArray(product.quantityBySize) ? product.quantityBySize : [];
  const locationStr = getLocationDisplay(product.location);

  // Inline stock editor state: clone current quantities for controlled inputs
  const [editQuantities, setEditQuantities] = useState<{ sizeCode: string; quantity: number }[]>([]);
  const [editQuantitySingle, setEditQuantitySingle] = useState(0);

  useEffect(() => {
    if (kind === 'sized' && quantityBySize.length > 0) {
      setEditQuantities(quantityBySize.map((s) => ({ sizeCode: s.sizeCode ?? '', quantity: Number(s.quantity ?? 0) || 0 })));
    } else {
      setEditQuantitySingle(Number(product.quantity ?? 0) || 0);
    }
  }, [kind, quantityBySize, product.quantity, isQuickStockOpen]);

  useEffect(() => {
    if (priceEditing && priceInputRef.current) {
      priceInputRef.current.focus();
      priceInputRef.current.select();
    }
  }, [priceEditing]);

  const handleOpenQuickStock = () => {
    onQuickStock(product.id);
  };

  const handleCancelStock = () => {
    onQuickStock(''); // parent clears editing id
  };

  const handleSaveStock = async () => {
    setSavingStock(true);
    try {
      if (kind === 'sized' && editQuantities.length > 0) {
        await onSaveStock(product.id, { quantityBySize: editQuantities });
      } else {
        await onSaveStock(product.id, { quantity: editQuantitySingle });
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      onQuickStock('');
    } catch {
      // caller/toast can show error
    } finally {
      setSavingStock(false);
    }
  };

  const handleSavePrice = async () => {
    const num = parseFloat(priceInputValue);
    if (!Number.isFinite(num) || num < 0) {
      setPriceEditing(false);
      return;
    }
    if (onSavePrice && num !== Number(product.sellingPrice ?? 0)) {
      await onSavePrice(product.id, num);
    }
    setPriceEditing(false);
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      setPriceInputValue(String(product.sellingPrice ?? 0));
      setPriceEditing(false);
    }
  };

  // —— Size pills / single qty (read-only view) ——
  const sizesContent =
    kind === 'na' ? (
      <div className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold">
        <Layers className="w-3.5 h-3.5" />
        Qty: {Number(product.quantity ?? 0) || 0}
      </div>
    ) : kind === 'one_size' ? (
      <div className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold">
        One size · {Number(product.quantity ?? 0) || 0}
      </div>
    ) : (
      <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-none">
        {quantityBySize.map((s) => {
          const q = Number(s.quantity ?? 0) || 0;
          return (
            <span
              key={s.sizeCode}
              className={`flex-shrink-0 h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                q > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400 border border-slate-200'
              }`}
            >
              {s.sizeCode} <span className="font-medium text-slate-500">· {q}</span>
            </span>
          );
        })}
      </div>
    );

  // —— Inline stock editor ——
  const stockEditorContent = isQuickStockOpen && (
    <div className="p-4 border-t border-slate-100">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Update stock</div>
      {kind === 'sized' && editQuantities.length > 0 ? (
        <>
          {editQuantities.map((row, i) => (
            <div key={row.sizeCode} className="grid grid-cols-[1fr_100px] gap-2 items-center py-1.5 border-b border-slate-100 last:border-0">
              <div>
                <div className="font-semibold text-slate-700 text-sm">{row.sizeCode}</div>
                <div className="text-xs text-slate-400">Current: {quantityBySize[i]?.quantity ?? 0}</div>
              </div>
              <input
                type="number"
                min={0}
                className="input-field h-10 rounded-lg text-center font-bold text-base"
                value={row.quantity}
                onChange={(e) => {
                  const next = [...editQuantities];
                  next[i] = { ...next[i], quantity: Math.max(0, parseInt(e.target.value, 10) || 0) };
                  setEditQuantities(next);
                }}
              />
            </div>
          ))}
        </>
      ) : (
        <div className="grid grid-cols-[1fr_100px] gap-2 items-center py-1.5">
          <div>
            <div className="font-semibold text-slate-700 text-sm">{kind === 'one_size' ? 'One size' : 'Quantity'}</div>
            <div className="text-xs text-slate-400">Current: {Number(product.quantity ?? 0) || 0}</div>
          </div>
          <input
            type="number"
            min={0}
            className="input-field h-10 rounded-lg text-center font-bold text-base"
            value={editQuantitySingle}
            onChange={(e) => setEditQuantitySingle(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button variant="ghost" type="button" onClick={handleCancelStock} className="h-11 rounded-xl">
          Cancel
        </Button>
        <Button variant="primary" type="button" onClick={handleSaveStock} disabled={savingStock} className="h-11 rounded-xl">
          {savingStock ? 'Saving…' : 'Save stock'}
        </Button>
      </div>
    </div>
  );

  return (
    <div
      className={`solid-card rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 min-h-[380px] flex flex-col p-0 ${
        isQuickStockOpen ? 'ring-2 ring-primary-500/80 shadow-card-hover' : ''
      } ${savedFlash ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}
      onClick={() => !isQuickStockOpen && canEdit && onEdit(product)}
    >
      {/* Image 16:9 */}
      <div className="relative w-full pt-[56.25%] bg-slate-100 overflow-hidden">
        {Array.isArray(product.images) && product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <Package className="w-10 h-10" strokeWidth={1.2} />
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 h-6 px-2.5 rounded-full bg-white/90 backdrop-blur-sm text-[11px] font-semibold text-slate-700 flex items-center">
          {product.category || 'Uncategorized'}
        </span>
        <span
          className={`absolute top-2.5 right-2.5 h-6 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
            status.cls === 'in'
              ? 'bg-emerald-500/15 text-emerald-800'
              : status.cls === 'low'
                ? 'bg-amber-500/15 text-amber-800'
                : 'bg-red-500/15 text-red-800'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status.cls === 'in' ? 'bg-emerald-500' : status.cls === 'low' ? 'bg-amber-500' : 'bg-red-500'
            }`}
          />
          {status.label}
        </span>
      </div>

      <div className="flex-1 flex flex-col p-4 pt-3">
        {!isQuickStockOpen && (
          <>
            <h3 className="font-bold text-slate-900 text-[15px] truncate mb-0.5" title={product.name}>
              {product.name}
            </h3>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="font-mono text-[11px] text-slate-400">{product.sku}</span>
              {locationStr && locationStr !== '—' && (
                <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  {locationStr}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              {priceEditing ? (
                <input
                  ref={priceInputRef}
                  type="number"
                  min={0}
                  step={0.01}
                  value={priceInputValue}
                  onChange={(e) => setPriceInputValue(e.target.value)}
                  onBlur={handleSavePrice}
                  onKeyDown={handlePriceKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[17px] font-bold text-primary-600 border-none border-b-2 border-primary-500 bg-transparent outline-none w-24 font-[inherit]"
                />
              ) : (
                <span
                  className="text-[17px] font-bold text-primary-600 cursor-text hover:bg-primary-50/80 rounded px-1 -mx-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canEdit && onSavePrice) {
                      setPriceInputValue(String(product.sellingPrice ?? 0));
                      setPriceEditing(true);
                    }
                  }}
                >
                  {formatCurrency(product.sellingPrice)}
                </span>
              )}
              {showCostPrice && (
                <span className="text-xs text-slate-400">Cost: {formatCurrency(product.costPrice)}</span>
              )}
            </div>
            <div className="mb-3">{sizesContent}</div>
            <div className="grid grid-cols-2 border-t border-slate-100 mt-auto pt-3 -mx-4 px-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(product);
                }}
                className="h-11 flex items-center justify-center gap-1.5 text-slate-500 font-semibold text-sm border-r border-slate-100 hover:bg-slate-50 transition-colors min-h-touch"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenQuickStock();
                }}
                className="h-11 flex items-center justify-center gap-1.5 text-primary-600 font-semibold text-sm hover:bg-primary-50 transition-colors min-h-touch"
              >
                <Layers className="w-3.5 h-3.5" />
                Stock
              </button>
            </div>
          </>
        )}
        {stockEditorContent}
      </div>
    </div>
  );
}
