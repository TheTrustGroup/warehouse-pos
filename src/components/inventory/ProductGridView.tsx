import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { ProductSyncBadge } from '../ProductSyncBadge';
import { Package, Edit, Trash2, AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAnimations } from '../../hooks/useAnimations';
import { glassReveal, glassHover, liquidMorph, rippleVariants } from '../../animations/liquidGlass';
import { hapticFeedback } from '../../lib/haptics';

interface ProductGridViewProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canSelect?: boolean;
  showCostPrice?: boolean;
  isUnsynced?: (productId: string) => boolean;
  onVerifySaved?: (productId: string) => Promise<{ saved: boolean; product?: Product }>;
  onRetrySync?: () => void;
  /** When true, disable delete (e.g. server unavailable). */
  disableDestructiveActions?: boolean;
}

export function ProductGridView({
  products,
  onEdit,
  onDelete,
  selectedIds,
  onSelectChange,
  canEdit = true,
  canDelete = true,
  canSelect = true,
  showCostPrice: _showCostPrice = true,
  isUnsynced,
  onVerifySaved,
  onRetrySync,
  disableDestructiveActions = false,
}: ProductGridViewProps) {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [ripple, setRipple] = useState<{ productId: string; x: number; y: number; id: number } | null>(null);
  const { reduced } = useAnimations();
  /* Stable layout: no y/scale on reveal or hover to prevent list jitter (Phase 3). */
  const reveal = glassReveal(true);
  const hover = glassHover(true);
  const morph = liquidMorph(true);
  const rippleV = rippleVariants(reduced);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>, productId: string) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipple({ productId, x, y, id: Date.now() });
    hapticFeedback(8);
    setTimeout(() => setRipple((prev) => (prev?.productId === productId ? null : prev)), 400);
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    onSelectChange(
      checked 
        ? [...selectedIds, id]
        : selectedIds.filter(sid => sid !== id)
    );
  };

  const getStockStatus = (product: Product) => {
    const qty = Number(product.quantity ?? 0) || 0;
    const reorder = Number(product.reorderLevel ?? 0) || 0;
    if (qty === 0) return { label: 'Out of Stock', color: 'border-red-200 bg-red-50' };
    if (qty <= reorder) return { label: 'Low Stock', color: 'border-amber-200 bg-amber-50' };
    return { label: 'In Stock', color: 'border-green-200 bg-green-50' };
  };

  /* Grid: consistent gap-5, no animation delay (calm, predictable) */
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {products.map((product) => {
        const status = getStockStatus(product);
        const isSelected = selectedIds.includes(product.id);

        return (
          <motion.div
            key={product.id}
            {...reveal}
            {...hover}
            {...morph}
            onClick={(e) => handleCardClick(e, product.id)}
            className={`solid-card group cursor-pointer relative overflow-hidden min-h-[380px] ${
              canSelect && isSelected ? 'ring-2 ring-primary-500 ring-offset-2' : ''
            }`}
          >
            <AnimatePresence>
              {ripple?.productId === product.id && (
                <motion.span
                  key={ripple.id}
                  className="absolute rounded-full bg-white/40 pointer-events-none"
                  style={{
                    left: ripple.x,
                    top: ripple.y,
                    width: 20,
                    height: 20,
                    marginLeft: -10,
                    marginTop: -10,
                  }}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={rippleV}
                />
              )}
            </AnimatePresence>
            {canSelect && (
              <div className="absolute top-4 left-4 z-10">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => handleSelectOne(product.id, e.target.checked)}
                  className="rounded border-slate-300 w-5 h-5 cursor-pointer shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            {(product as Product & { syncStatus?: string }).syncStatus && (
              <div className="absolute top-3 right-3 z-10">
                <ProductSyncBadge
                  status={(product as Product & { syncStatus?: string }).syncStatus as 'synced' | 'pending' | 'syncing' | 'error'}
                  onRetry={onRetrySync}
                />
              </div>
            )}
            {product._pending && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 text-primary-700 text-xs font-medium" aria-live="polite">
                Saving…
              </div>
            )}
            {((product as Product & { syncStatus?: string }).syncStatus || isUnsynced?.(product.id)) && !(product as Product & { syncStatus?: string }).syncStatus && (
              <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-1.5">
                {isUnsynced?.(product.id) && !(product as Product & { syncStatus?: string }).syncStatus && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-medium" title="Saved on this device only">
                    <CloudOff className="w-3.5 h-3.5" />
                    Local only
                  </span>
                )}
                {isUnsynced?.(product.id) && onVerifySaved && (
                  <Button
                    type="button"
                    variant="action"
                    size="sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setVerifyingId(product.id);
                      try {
                        await onVerifySaved(product.id);
                      } finally {
                        setVerifyingId(null);
                      }
                    }}
                    disabled={verifyingId === product.id}
                    className="p-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-60 min-h-0"
                    title="Check if saved to server"
                  >
                    <RefreshCw className={`w-4 h-4 ${verifyingId === product.id ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            )}
            {product.images[0] ? (
              <img 
                src={product.images[0]} 
                alt={product.name}
                loading="lazy"
                className="w-full h-40 object-cover rounded-xl mb-4 group-hover:scale-105 transition-transform duration-300 shadow-md"
              />
            ) : (
              <div className="w-full h-48 bg-slate-100 rounded-lg mb-4 flex items-center justify-center border border-slate-200/50">
                <Package className="w-16 h-16 text-slate-400" />
              </div>
            )}

            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-lg text-slate-900 mb-1.5">{product.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{product.description}</p>
              </div>

              <div className="flex items-center justify-between text-sm py-2 px-3 bg-slate-50/80 rounded-lg border border-slate-200/50">
                <span className="text-slate-500 font-medium">SKU:</span>
                <span className="font-semibold text-slate-900">{product.sku}</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-2xl font-bold gradient-text tracking-tight">
                  {formatCurrency(product.sellingPrice)}
                </span>
                <span className={`badge ${
                  status.label === 'In Stock'
                    ? 'badge-success'
                    : status.label === 'Low Stock'
                    ? 'badge-warning'
                    : 'badge-error'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {Number(product.quantity ?? 0) || 0} left
                </span>
              </div>
              {(product.sizeKind === 'sized' || (product.quantityBySize?.length)) && product.quantityBySize && product.quantityBySize.length > 0 && (
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
                  {product.quantityBySize.map((s) => (
                    <span key={s.sizeCode}>{s.sizeLabel ?? s.sizeCode}: {s.quantity}</span>
                  ))}
                </div>
              )}
              {status.label !== 'In Stock' && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs font-semibold">{status.label}</span>
                </div>
              )}

              {(canEdit || canDelete) && (
                <div className="flex gap-2 pt-3 border-t border-slate-200/50">
                  {canEdit && (
                    <Button
                      type="button"
                      variant="actionEdit"
                      onClick={(e) => { e.stopPropagation(); onEdit(product); }}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-primary-50 text-primary-600 hover:bg-primary-100 font-medium text-sm inline-flex items-center justify-center gap-2"
                      aria-label={`Edit ${product.name}`}
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={disableDestructiveActions}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (disableDestructiveActions) return;
                        if (confirm('Delete this product?')) onDelete(product.id);
                      }}
                      className="py-2.5 px-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center min-w-touch"
                      aria-label={`Delete ${product.name}`}
                      title={disableDestructiveActions ? 'Server unavailable' : undefined}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}

      {products.length === 0 && (
        <div className="col-span-full text-center py-12">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Package className="w-6 h-6 text-slate-400" aria-hidden />
          </div>
          <p className="text-slate-600 text-sm font-medium">No products found</p>
        </div>
      )}
    </div>
  );
}
