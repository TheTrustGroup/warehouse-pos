import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInventory, ProductFilters, ADD_PRODUCT_SAVED_LOCALLY } from '../contexts/InventoryContext';
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
import { Plus, LayoutGrid, List, Trash2, Download, Package, AlertTriangle, RefreshCw, Upload } from 'lucide-react';

type ViewMode = 'table' | 'grid';

export function Inventory() {
  const { products, isLoading, error, addProduct, updateProduct, deleteProduct, deleteProducts, searchProducts, filterProducts, refreshProducts, syncLocalInventoryToApi, unsyncedCount, lastSyncAt, isUnsynced, verifyProductSaved, storagePersistFailed } = useInventory();
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

  // When Inventory page is opened, fetch fresh data in background so recorded items always show and list stays swift
  useEffect(() => {
    refreshProducts({ silent: true, bypassCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to ensure fresh list
  }, []);
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
          <p className="text-slate-600 text-sm mb-6">{error}</p>
          <button
            type="button"
            onClick={() => refreshProducts()}
            className="btn-primary inline-flex items-center gap-2"
            aria-label="Retry loading products"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
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
            <button
              type="button"
              onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
              className="btn-primary inline-flex items-center gap-2 min-h-touch"
              aria-label="Add first product"
            >
              <Plus className="w-5 h-5" />
              Add first product
            </button>
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
        showToast('error', error instanceof Error ? error.message : 'Failed to delete product');
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
        showToast('error', error instanceof Error ? error.message : 'Failed to delete products');
      }
    }
  };

  /**
   * RELIABILITY: "Saved" is shown only after API 2xx and read-after-write verification.
   * On failure: clear error toast, retry possible; modal stays open and form is not reset.
   */
  const handleSubmitProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    const warehouseLabel = currentWarehouse?.name ?? currentWarehouseId ?? 'warehouse';
    if (editingProduct) {
      try {
        await updateProduct(editingProduct.id, productData);
        setIsModalOpen(false);
        setEditingProduct(null);
        showToast('success', `Saved to ${warehouseLabel}`);
      } catch (error) {
        showToast('error', error instanceof Error ? error.message : 'Failed to update product');
        throw error;
      }
      return;
    }
    try {
      await addProduct(productData);
      setIsModalOpen(false);
      setEditingProduct(null);
      showToast('success', `Saved to ${warehouseLabel}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save product. Write failed.';
      if (msg === ADD_PRODUCT_SAVED_LOCALLY) {
        setIsModalOpen(false);
        setEditingProduct(null);
        showToast('warning', msg);
      } else {
        showToast('error', msg);
        throw e;
      }
    }
  };

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

  /** Single sync entry point: used only by the unsynced banner CTA. Do not add another sync button elsewhere (UI clarity, single-responsibility). */
  const handleSyncToServer = async () => {
    setIsSyncing(true);
    try {
      const { synced, failed, total } = await syncLocalInventoryToApi();
      if (total === 0) {
        showToast('warning', 'No locally recorded items to sync here. If you added items in another browser (e.g. Safari), open this app in that browser and click "Sync recorded items to server" there to push them so they appear everywhere.');
      } else if (failed === 0) {
        showToast('success', `Synced ${synced} item${synced !== 1 ? 's' : ''} to the server. They will appear in all browsers.`);
      } else if (synced > 0) {
        showToast('warning', `Synced ${synced} of ${total} items. ${failed} failed (check connection).`);
      } else {
        const devHint = import.meta.env.DEV
          ? ` Backend: ${API_BASE_URL}. For local dev, run "cd inventory-server && npm run dev" and set VITE_API_BASE_URL=http://localhost:3001 in .env.local.`
          : '';
        showToast('error', `Could not reach the server. Try again when connected.${devHint}`);
      }
    } catch {
      showToast('error', 'Sync failed. Check your connection and try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  /* Vertical rhythm: space-y-6 (section spacing); one primary CTA per screen = Add Product */
  return (
    <div className="space-y-6">
      {storagePersistFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1">
            <p className="text-red-900 text-sm font-medium">Inventory could not be saved to this device&apos;s storage.</p>
            <p className="text-red-800 text-xs mt-1">
              This can happen in private browsing or when storage is full. Recorded items may not appear after refresh. Check <strong>Settings → Data &amp; cache</strong> to see what is stored, or use a normal browser window.
            </p>
          </div>
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
          <button
            type="button"
            onClick={handleAddProduct}
            className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
            aria-label="Add product"
          >
            <Plus className="w-5 h-5" />
            Add product
          </button>
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
                  <button
                    type="button"
                    onClick={handleExport}
                    className="btn-secondary min-h-touch px-4 py-2 text-sm inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
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
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setFilters({}); }}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium min-h-touch inline-flex items-center"
                >
                  Clear filters
                </button>
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
              isUnsynced={isUnsynced}
              onVerifySaved={verifyProductSaved}
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
              isUnsynced={isUnsynced}
              onVerifySaved={verifyProductSaved}
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
