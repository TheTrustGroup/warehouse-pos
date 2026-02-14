import { useInventoryPageState } from './useInventoryPageState';
import { API_BASE_URL } from '../lib/api';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { ProductTableView } from '../components/inventory/ProductTableView';
import { ProductGridView } from '../components/inventory/ProductGridView';
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { InventoryFilters } from '../components/inventory/InventoryFilters';
import { InventorySearchBar } from '../components/inventory/InventorySearchBar';
import { Product } from '../types';
import { getLocationDisplay, formatRelativeTime } from '../lib/utils';
import { getUserFriendlyMessage } from '../lib/errorMessages';
import { Button } from '../components/ui/Button';
import { Plus, LayoutGrid, List, Trash2, Download, Package, AlertTriangle, RefreshCw, Upload } from 'lucide-react';

/**
 * Inventory page: single hook (useInventoryPageState) then early returns or content.
 * This structure guarantees React never sees a different number of hooks between renders (#310).
 */
export function Inventory() {
  const s = useInventoryPageState();
  const { isDegraded } = useApiStatus();
  /** Read-only when server is unreachable (degraded). When offline, allow add/edit so products can be saved locally and sync when online. */
  const readOnlyMode = isDegraded;
  const disableDestructive = readOnlyMode;

  const handleAddProduct = () => {
    s.setEditingProduct(null);
    s.setIsModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    s.setEditingProduct(product);
    s.setIsModalOpen(true);
  };

  const handleViewProduct = (product: Product) => {
    s.setEditingProduct(product);
    s.setIsModalOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      try {
        await s.deleteProduct(id);
        s.setSelectedIds(prev => prev.filter(sid => sid !== id));
        s.showToast('success', 'Product deleted successfully');
      } catch (error) {
        s.showToast('error', getUserFriendlyMessage(error));
      }
    }
  };

  const handleBulkDelete = async () => {
    if (s.selectedIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${s.selectedIds.length} product(s)?`)) {
      try {
        await s.deleteProducts(s.selectedIds);
        s.setSelectedIds([]);
        s.showToast('success', `${s.selectedIds.length} product(s) deleted successfully`);
      } catch (error) {
        s.showToast('error', getUserFriendlyMessage(error));
      }
    }
  };

  const handleSubmitProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (s.editingProduct) {
      try {
        await s.updateProduct(s.editingProduct.id, productData);
        s.setIsModalOpen(false);
        s.setEditingProduct(null);
      } catch {
        throw undefined;
      }
      return;
    }
    try {
      const newId = await s.addProduct(productData);
      s.setIsModalOpen(false);
      s.setEditingProduct(null);
      s.setUndoStack((prev) => {
        const next = [{ productId: newId, at: Date.now() }, ...prev].slice(0, s.MAX_UNDO_ENTRIES);
        return next;
      });
    } catch (e) {
      throw e;
    }
  };

  const handleUndoAdd = async (productId: string) => {
    try {
      await s.undoAddProduct(productId);
      s.setUndoStack((prev) => prev.filter((e) => e.productId !== productId));
      s.showToast('success', 'Add undone.');
    } catch {
      s.showToast('error', 'Could not undo.');
    }
  };

  const handleExport = () => {
    const headers = ['SKU', 'Name', 'Category', 'Quantity', 'Cost Price', 'Selling Price', 'Location'];
    const rows = s.filteredProducts.map(p => [
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

  const handleSyncToServer = async () => {
    s.setIsSyncing(true);
    try {
      await s.refreshProducts();
      s.showToast('success', 'Sync complete. Pending items have been sent to the server.');
    } catch {
      s.showToast('error', 'Sync failed. Check your connection and try again.');
    } finally {
      s.setIsSyncing(false);
    }
  };

  return (
    <>
      {s.isLoading && (
        <div className="flex items-center justify-center min-h-[60dvh]" role="status" aria-live="polite">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-200 border-t-primary-600 mx-auto mb-4" />
            <p className="text-slate-600 text-sm font-medium">Loading products…</p>
          </div>
        </div>
      )}
      {!s.isLoading && s.error && (
        <div className="flex items-center justify-center min-h-[60dvh]">
          <div className="solid-card max-w-md w-full mx-auto text-center p-8">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-600" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Error loading products</h2>
            <p className="text-slate-600 text-sm mb-4">{s.error}</p>
            <p className="text-slate-500 text-xs mb-6 break-all font-mono">
              Backend: {API_BASE_URL}
            </p>
            <Button variant="primary" onClick={() => s.refreshProducts({ bypassCache: true, timeoutMs: 60_000 })} className="inline-flex items-center gap-2" aria-label="Retry loading products">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </div>
        </div>
      )}
      {!s.isLoading && !s.error && s.products.length === 0 && (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="solid-card max-w-md w-full mx-auto text-center p-8">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-slate-400" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">No products yet</h2>
            <p className="text-slate-600 text-sm mb-6">
              Add your first product to get started.
            </p>
            {s.canCreate && (
              <Button variant="primary" onClick={() => { s.setEditingProduct(null); s.setIsModalOpen(true); }} disabled={readOnlyMode} title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined} className="inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed" aria-label="Add first product">
                <Plus className="w-5 h-5" />
                Add first product
              </Button>
            )}
          </div>
        </div>
      )}
      {!s.isLoading && !s.error && s.products.length > 0 && (
    <div className="space-y-6">
      {s.isBackgroundRefreshing && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-100/90 px-3 py-2 text-slate-600 text-sm" role="status" aria-live="polite">
          <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" aria-hidden />
          <span>Updating…</span>
        </div>
      )}
      {s.canUndoLatest && s.latestUndoEntry && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/90 px-4 py-3 flex flex-wrap items-center justify-between gap-2" role="status">
          <span className="text-primary-900 text-sm font-medium">
            Product added. You can undo within {s.undoSecondsLeft}s.
          </span>
          <Button variant="secondary" size="sm" onClick={() => handleUndoAdd(s.latestUndoEntry!.productId)} className="inline-flex items-center gap-2">
            Undo
          </Button>
        </div>
      )}
      {s.unsyncedCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-amber-900 text-sm font-medium flex-1">
            <AlertTriangle className="inline-block w-4 h-4 mr-2 align-middle text-amber-600" aria-hidden />
            {s.unsyncedCount} item{s.unsyncedCount !== 1 ? 's' : ''} on this device only. Sync to see them everywhere.
          </p>
          <button
            type="button"
            onClick={handleSyncToServer}
            disabled={s.isSyncing}
            className="flex items-center justify-center gap-2 min-h-touch px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 touch-manipulation w-full sm:w-auto"
            aria-label="Sync to server now"
          >
            {s.isSyncing ? <RefreshCw className="w-5 h-5 animate-spin" aria-hidden /> : <Upload className="w-5 h-5" />}
            {s.isSyncing ? 'Syncing…' : 'Sync to server'}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Inventory</h1>
          <p className="text-slate-500 text-sm">
            {s.filteredProducts.length} product{s.filteredProducts.length !== 1 ? 's' : ''} found
            {s.filteredProducts.length !== s.products.length && ` of ${s.products.length}`}
            {s.currentWarehouseId && (
              <span className="text-slate-600 font-medium"> · Warehouse: {s.currentWarehouse?.name ?? s.currentWarehouseId}</span>
            )}
          </p>
          {s.lastSyncAt && (
            <p className="text-slate-400 text-xs mt-0.5" aria-live="polite">
              Updated {formatRelativeTime(s.lastSyncAt)}
            </p>
          )}
        </div>
        {s.canCreate && (
          <Button variant="primary" onClick={handleAddProduct} disabled={readOnlyMode} title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined} className="flex items-center justify-center gap-2 w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed" aria-label="Add product">
            <Plus className="w-5 h-5" />
            Add product
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <InventorySearchBar value={s.searchQuery} onChange={s.setSearchQuery} />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 flex-shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => s.setViewMode('table')}
            className={`min-w-touch min-h-touch rounded-lg flex items-center justify-center transition-colors ${
              s.viewMode === 'table' ? 'bg-primary-100 text-primary-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
            aria-label="Table view"
            aria-pressed={s.viewMode === 'table'}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => s.setViewMode('grid')}
            className={`min-w-touch min-h-touch rounded-lg flex items-center justify-center transition-colors ${
              s.viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
            aria-label="Grid view"
            aria-pressed={s.viewMode === 'grid'}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-x-hidden">
        <div className="lg:col-span-1">
          <InventoryFilters filters={s.filters} onFiltersChange={s.setFilters} categories={s.categories} />
        </div>

        <div className="lg:col-span-3 space-y-4">
          {s.canBulk && s.selectedIds.length > 0 && (
            <div className="solid-card bg-primary-50 border border-primary-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-primary-900">
                  {s.selectedIds.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleExport} size="sm" className="inline-flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export
                  </Button>
                  {s.canDelete && (
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={disableDestructive}
                      title={disableDestructive ? 'Server unavailable. Try again when the banner is gone.' : undefined}
                      className="min-h-touch px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
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

          {s.filteredProducts.length === 0 ? (
            <div className="solid-card text-center p-8">
              <Package className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden />
              <h2 className="text-base font-semibold text-slate-900 mb-1">No products match</h2>
              <p className="text-slate-600 text-sm mb-4">
                Try different search or filters.
              </p>
              {(s.searchQuery || Object.keys(s.filters).length > 0) && (
                <Button variant="ghost" size="sm" onClick={() => { s.setSearchQuery(''); s.setFilters({}); }} className="text-sm">
                  Clear filters
                </Button>
              )}
            </div>
          ) : s.viewMode === 'table' ? (
            <ProductTableView
              products={s.filteredProducts}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
              onView={handleViewProduct}
              selectedIds={s.selectedIds}
              onSelectChange={s.setSelectedIds}
              canEdit={s.canUpdate}
              canDelete={s.canDelete}
              canSelect={s.canBulk}
              showCostPrice={s.canViewCostPrice}
              isUnsynced={(id) => s.isUnsyncedBySyncStatus(id) || s.isUnsynced(id)}
              onVerifySaved={s.verifyProductSaved}
              onRetrySync={s.refreshProducts}
              disableDestructiveActions={disableDestructive}
            />
          ) : (
            <ProductGridView
              products={s.filteredProducts}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
              selectedIds={s.selectedIds}
              onSelectChange={s.setSelectedIds}
              canEdit={s.canUpdate}
              canDelete={s.canDelete}
              canSelect={s.canBulk}
              showCostPrice={s.canViewCostPrice}
              isUnsynced={(id) => s.isUnsyncedBySyncStatus(id) || s.isUnsynced(id)}
              onVerifySaved={s.verifyProductSaved}
              onRetrySync={s.refreshProducts}
              disableDestructiveActions={disableDestructive}
            />
          )}
        </div>
      </div>

    </div>
      )}
      <ProductFormModal
        isOpen={s.isModalOpen}
        onClose={() => { s.setIsModalOpen(false); s.setEditingProduct(null); }}
        onSubmit={handleSubmitProduct}
        product={s.editingProduct}
        readOnlyMode={readOnlyMode}
      />
    </>
  );
}
