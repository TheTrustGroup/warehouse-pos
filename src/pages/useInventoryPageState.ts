/**
 * Single hook for the Inventory page. All hook logic lives here so that
 * Inventory.tsx has exactly one unconditional hook call, preventing React #310
 * (rendered more hooks than previous render) regardless of loading/error/content state.
 */
import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInventory, ProductFilters } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useToast } from '../contexts/ToastContext';
import { Product } from '../types';
import { PERMISSIONS } from '../types/permissions';
import { getCategoryDisplay } from '../lib/utils';

const UNDO_WINDOW_MS = 10_000;
const MAX_UNDO_ENTRIES = 5;

export type ViewMode = 'table' | 'grid';

export function useInventoryPageState() {
  const { products, isLoading, error, addProduct, updateProduct, deleteProduct, deleteProducts, undoAddProduct, searchProducts, filterProducts, refreshProducts, isBackgroundRefreshing, unsyncedCount, lastSyncAt, isUnsynced, verifyProductSaved } = useInventory();
  const { hasPermission } = useAuth();
  const { currentWarehouse, currentWarehouseId } = useWarehouse();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [isSyncing, setIsSyncing] = useState(false);
  const [undoStack, setUndoStack] = useState<Array<{ productId: string; at: number }>>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ProductFilters>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  useEffect(() => {
    const q = searchParams.get('q');
    const filterParam = searchParams.get('filter');
    if (q) setSearchQuery(q);
    if (filterParam === 'lowStock') setFilters({ lowStock: true });
    else if (filterParam === 'outOfStock') setFilters({ outOfStock: true });
  }, [searchParams]);

  // Silent refresh on mount so we don't show "Loading products..." again (CriticalDataContext already ran phase 2).
  useEffect(() => {
    refreshProducts({ silent: true });
  }, [refreshProducts]);

  const isUnsyncedBySyncStatus = useMemo(() => {
    return (productId: string) => {
      const p = products.find((x) => x.id === productId);
      const status = (p as Product & { syncStatus?: string })?.syncStatus;
      return status !== undefined && status !== 'synced';
    };
  }, [products]);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => getCategoryDisplay(p.category)))).filter(Boolean).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchQuery.trim()) result = searchProducts(searchQuery);
    if (Object.keys(filters).length > 0) {
      const filtered = filterProducts(filters);
      if (searchQuery.trim()) {
        const searchIds = new Set(result.map(p => p.id));
        result = filtered.filter(p => searchIds.has(p.id));
      } else {
        result = filtered;
      }
    }
    return result;
  }, [products, searchQuery, filters, searchProducts, filterProducts]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setUndoStack((prev) => prev.filter((e) => now - e.at < UNDO_WINDOW_MS));
      const latest = undoStack[0];
      if (latest) {
        const left = Math.max(0, Math.ceil((UNDO_WINDOW_MS - (now - latest.at)) / 1000));
        setUndoSecondsLeft(left);
      } else {
        setUndoSecondsLeft(0);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [undoStack]);

  const canCreate = hasPermission(PERMISSIONS.INVENTORY.CREATE);
  const canUpdate = hasPermission(PERMISSIONS.INVENTORY.UPDATE);
  const canDelete = hasPermission(PERMISSIONS.INVENTORY.DELETE);
  const canBulk = hasPermission(PERMISSIONS.INVENTORY.BULK_ACTIONS);
  const canViewCostPrice = hasPermission(PERMISSIONS.INVENTORY.VIEW_COST_PRICE);
  const latestUndoEntry = undoStack.length > 0 ? undoStack[0] : null;
  const canUndoLatest = latestUndoEntry && undoSecondsLeft > 0;

  return {
    products,
    isLoading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
    deleteProducts,
    undoAddProduct,
    searchProducts,
    filterProducts,
    refreshProducts,
    isBackgroundRefreshing,
    unsyncedCount,
    lastSyncAt,
    isUnsynced,
    verifyProductSaved,
    showToast,
    currentWarehouse,
    currentWarehouseId,
    isSyncing,
    setIsSyncing,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    selectedIds,
    setSelectedIds,
    isModalOpen,
    setIsModalOpen,
    editingProduct,
    setEditingProduct,
    undoSecondsLeft,
    setUndoStack,
    isUnsyncedBySyncStatus,
    categories,
    filteredProducts,
    canCreate,
    canUpdate,
    canDelete,
    canBulk,
    canViewCostPrice,
    latestUndoEntry,
    canUndoLatest,
    UNDO_WINDOW_MS,
    MAX_UNDO_ENTRIES,
  };
}
