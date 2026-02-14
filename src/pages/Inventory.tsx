import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInventory, ProductFilters } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { API_BASE_URL } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { ProductTableView } from '../components/inventory/ProductTableView';
import { ProductGridView } from '../components/inventory/ProductGridView';
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { InventoryFilters } from '../components/inventory/InventoryFilters';
import { InventorySearchBar } from '../components/inventory/InventorySearchBar';
import { Product } from '../types';
import { PERMISSIONS } from '../types/permissions';
import { getCategoryDisplay, getLocationDisplay, formatRelativeTime } from '../lib/utils';
import { getUserFriendlyMessage } from '../lib/errorMessages';
import { Button } from '../components/ui/Button';
import { Plus, LayoutGrid, List, Trash2, Download, Package, AlertTriangle, RefreshCw, Upload } from 'lucide-react';

type ViewMode = 'table' | 'grid';

const UNDO_WINDOW_MS = 10_000;
const MAX_UNDO_ENTRIES = 5;

export function Inventory() {
  const { products, isLoading, error, addProduct, updateProduct, deleteProduct, deleteProducts, undoAddProduct, searchProducts, filterProducts, refreshProducts, isBackgroundRefreshing, unsyncedCount, lastSyncAt, isUnsynced, verifyProductSaved } = useInventory();
  const { hasPermission } = useAuth();
  const { currentWarehouse, currentWarehouseId } = useWarehouse();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [isSyncing, setIsSyncing] = useState(false);
  const canCreate = hasPermission(PERMISSIONS.INVENTORY.CREATE);
  const canUpdate = hasPermission(PERMISSIONS.INVENTORY.UPDATE);
  const canDelete = hasPermission(PERMISSIONS.INVENTORY.DELETE);
  const canBulk = hasPermission(PERMISSIONS.INVENTORY.BULK_ACTIONS);
  const canViewCostPrice = hasPermission(PERMISSIONS.INVENTORY.VIEW_COST_PRICE);

  const [undoStack, setUndoStack] = useState<Array<{ productId: string; at: number }>>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ProductFilters>({});

  // Handle URL query params on mount
  useEffect(() => {
    const q = searchParams.get('q');
    const filterParam = searchParams.get('filter');
    
    if (q) {
      setSearchQuery(q);
    }
    
    if (filterParam === 'lowStock') {
      setFilters({ lowStock: true });
    } else if (filterParam === 'outOfStock') {
      setFilters({ outOfStock: true });
    }
  }, [searchParams]);

  useEffect(() => {
    refreshProducts();
  }, [refreshProducts]);

  const isUnsyncedBySyncStatus = useMemo(() => {
    return (productId: string) => {
      const p = products.find((x) => x.id === productId);
      const status = (p as Product & { syncStatus?: string })?.syncStatus;
      return status !== undefined && status !== 'synced';
    };
  }, [products]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // All hooks must run unconditionally (before any early returns) to avoid React error #310
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

  /* Loading: immediate feedback, calm copy */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-live="polite">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-200 border-t-primary-600 mx-auto mb-4" />
          <p className="text-slate-600 text-sm font-medium">Loading products…</p>
        </div>
      </div>
    );
  }

  /* Error: one primary action (Retry), no competing elements */
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="glass-card max-w-md w-full mx-auto text-center p-8">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-600" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Error loading products</h2>
          <p className="text-slate-600 text-sm mb-4">{error}</p>
          <p className="text-slate-500 text-xs mb-6 break-all font-mono">
            Backend: {API_BASE_URL}
          </p>
          <Button variant="primary" onClick={() => refreshProducts()} className="inline-flex items-center gap-2" aria-label="Retry loading products">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  /* Empty state: single primary CTA — Add First Product */
  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="glass-card max-w-md w-full mx-auto text-center p-8">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-slate-400" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No products yet</h2>
          <p className="text-slate-600 text-sm mb-6">
            Add your first product to get started.
          </p>
          {canCreate && (
            <Button variant="primary" onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="inline-flex items-center gap-2" aria-label="Add first product">
              <Plus className="w-5 h-5" />
              Add first product
            </Button>
          )}
        </div>
      </div>
    );
  }

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleViewProduct = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteProduct(id);
        setSelectedIds(prev => prev.filter(sid => sid !== id));
        showToast('success', 'Product deleted successfully');
      } catch (error) {
        showToast('error', getUserFriendlyMessage(error));
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.length} product(s)?`)) {
      try {
        await deleteProducts(selectedIds);
        setSelectedIds([]);
        showToast('success', `${selectedIds.length} product(s) deleted successfully`);
      } catch (error) {
        showToast('error', getUserFriendlyMessage(error));
      }
    }
  };

  /**
   * Optimistic save: product appears in list immediately (useLiveQuery). On add, push to undo stack for 10s.
   */
  const handleSubmitProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingProduct) {
      try {
        await updateProduct(editingProduct.id, productData);
        setIsModalOpen(false);
        setEditingProduct(null);
      } catch {
        throw undefined;
      }
      return;
    }
    try {
      const newId = await addProduct(productData);
      setIsModalOpen(false);
      setEditingProduct(null);
      setUndoStack((prev) => {
        const next = [{ productId: newId, at: Date.now() }, ...prev].slice(0, MAX_UNDO_ENTRIES);
        return next;
      });
      setUndoSecondsLeft(Math.ceil(UNDO_WINDOW_MS / 1000));
    } catch (e) {
      throw e;
    }
  };

  const handleUndoAdd = async (productId: string) => {
    try {
      await undoAddProduct(productId);
      setUndoStack((prev) => prev.filter((e) => e.productId !== productId));
      showToast('success', 'Add undone.');
    } catch {
      showToast('error', 'Could not undo.');
    }
  };

  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

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

  const latestUndoEntry = undoStack.length > 0 ? undoStack[0] : null;
  const canUndoLatest = latestUndoEntry && undoSecondsLeft > 0;

  const handleExport = () => {
    const headers = ['SKU', 'Name', 'Category', 'Quantity', 'Cost Price', 'Selling Price', 'Location'];
    const rows = filteredProducts.map(p => [
      p.sku,
      p.name,
      p.category,
      p.quantity,
      p.costPrice,
      p.sellingPrice,
      getLocationDisplay(p.location)
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  /** Single sync entry point: process Dexie sync queue. */
  const handleSyncToServer = async () => {
    setIsSyncing(true);
    try {
      await refreshProducts();
      showToast('success', 'Sync complete. Pending items have been sent to the server.');
    } catch {
      showToast('error', 'Sync failed. Check your connection and try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  /* Vertical rhythm: space-y-6 (section spacing); one primary CTA per screen = Add Product */
  return (
    <div className="space-y-6">
      {isBackgroundRefreshing && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-100/90 px-3 py-2 text-slate-600 text-sm" role="status" aria-live="polite">
          <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" aria-hidden />
          <span>Updating…</span>
        </div>
      )}
      {canUndoLatest && latestUndoEntry && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/90 px-4 py-3 flex flex-wrap items-center justify-between gap-2" role="status">
          <span className="text-primary-900 text-sm font-medium">
            Product added. You can undo within {undoSecondsLeft}s.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleUndoAdd(latestUndoEntry.productId)}
            className="inline-flex items-center gap-2"
          >
            Undo
          </Button>
        </div>
      )}
      {unsyncedCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-amber-900 text-sm font-medium flex-1">
            <AlertTriangle className="inline-block w-4 h-4 mr-2 align-middle text-amber-600" aria-hidden />
            {unsyncedCount} item{unsyncedCount !== 1 ? 's' : ''} on this device only. Sync to see them everywhere.
          </p>
          <button
            type="button"
            onClick={handleSyncToServer}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 min-h-touch px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 touch-manipulation w-full sm:w-auto"
            aria-label="Sync to server now"
          >
            {isSyncing ? <RefreshCw className="w-5 h-5 animate-spin" aria-hidden /> : <Upload className="w-5 h-5" />}
            {isSyncing ? 'Syncing…' : 'Sync to server'}
          </button>
        </div>
      )}
      {/* Header: title + count; single primary action = Add Product; warehouse filter label */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Inventory</h1>
          <p className="text-slate-500 text-sm">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
            {filteredProducts.length !== products.length && ` of ${products.length}`}
            {currentWarehouseId && (
              <span className="text-slate-600 font-medium"> · Warehouse: {currentWarehouse?.name ?? currentWarehouseId}</span>
            )}
          </p>
          {lastSyncAt && (
            <p className="text-slate-400 text-xs mt-0.5" aria-live="polite">
              Updated {formatRelativeTime(lastSyncAt)}
            </p>
          )}
        </div>
        {canCreate && (
          <Button variant="primary" onClick={handleAddProduct} className="flex items-center justify-center gap-2 w-full sm:w-auto" aria-label="Add product">
            <Plus className="w-5 h-5" />
            Add product
          </Button>
        )}
      </div>

      {/* Search + view toggle: aligned to grid, no horizontal scroll on mobile */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <InventorySearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <div className="flex items-center gap-1 bg-white/80 rounded-xl border border-slate-200/60 p-1 flex-shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`min-w-touch min-h-touch rounded-lg flex items-center justify-center transition-colors ${
              viewMode === 'table' ? 'bg-primary-100 text-primary-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`min-w-touch min-h-touch rounded-lg flex items-center justify-center transition-colors ${
              viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-x-hidden">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          <InventoryFilters
            filters={filters}
            onFiltersChange={setFilters}
            categories={categories}
          />
        </div>

        {/* Products List/Grid */}
        <div className="lg:col-span-3 space-y-4">
          {/* Bulk Actions */}
          {canBulk && selectedIds.length > 0 && (
            <div className="glass-card bg-primary-50/60 border border-primary-200/50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-primary-900">
                  {selectedIds.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleExport} size="sm" className="inline-flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export
                  </Button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      className="min-h-touch px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 inline-flex items-center gap-2 transition-colors"
                      aria-label="Delete selected products"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Products Display */}
          {filteredProducts.length === 0 ? (
            <div className="glass-card text-center p-8">
              <Package className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden />
              <h2 className="text-base font-semibold text-slate-900 mb-1">No products match</h2>
              <p className="text-slate-600 text-sm mb-4">
                Try different search or filters.
              </p>
              {(searchQuery || Object.keys(filters).length > 0) && (
                <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setFilters({}); }} className="text-sm">
                  Clear filters
                </Button>
              )}
            </div>
          ) : viewMode === 'table' ? (
            <ProductTableView
              products={filteredProducts}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
              onView={handleViewProduct}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              canEdit={canUpdate}
              canDelete={canDelete}
              canSelect={canBulk}
              showCostPrice={canViewCostPrice}
              isUnsynced={(id) => isUnsyncedBySyncStatus(id) || isUnsynced(id)}
              onVerifySaved={verifyProductSaved}
              onRetrySync={refreshProducts}
            />
          ) : (
            <ProductGridView
              products={filteredProducts}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              canEdit={canUpdate}
              canDelete={canDelete}
              canSelect={canBulk}
              showCostPrice={canViewCostPrice}
              isUnsynced={(id) => isUnsyncedBySyncStatus(id) || isUnsynced(id)}
              onVerifySaved={verifyProductSaved}
              onRetrySync={refreshProducts}
            />
          )}
        </div>
      </div>

      {/* Product Form Modal */}
      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        onSubmit={handleSubmitProduct}
        product={editingProduct}
      />
    </div>
  );
}
