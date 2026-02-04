import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInventory, ProductFilters, ADD_PRODUCT_SAVED_LOCALLY } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ProductTableView } from '../components/inventory/ProductTableView';
import { ProductGridView } from '../components/inventory/ProductGridView';
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { InventoryFilters } from '../components/inventory/InventoryFilters';
import { InventorySearchBar } from '../components/inventory/InventorySearchBar';
import { Product } from '../types';
import { PERMISSIONS } from '../types/permissions';
import { getCategoryDisplay, getLocationDisplay } from '../lib/utils';
import { Plus, LayoutGrid, List, Trash2, Download, Package, AlertTriangle, RefreshCw, Upload } from 'lucide-react';

type ViewMode = 'table' | 'grid';

export function Inventory() {
  const { products, isLoading, error, addProduct, updateProduct, deleteProduct, deleteProducts, searchProducts, filterProducts, refreshProducts, syncLocalInventoryToApi } = useInventory();
  const { hasPermission } = useAuth();
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading products...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card max-w-md mx-auto text-center p-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Products</h3>
          <p className="text-slate-600 mb-6">{error}</p>
          <button 
            onClick={() => refreshProducts()} 
            className="btn-primary flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state (no products at all, not filtered)
  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card max-w-md mx-auto text-center p-8">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Products Yet</h3>
          <p className="text-slate-600 mb-6">
            Get started by adding your first product to the inventory.
          </p>
          {canCreate && (
            <button 
              onClick={() => {
                setEditingProduct(null);
                setIsModalOpen(true);
              }} 
              className="btn-primary flex items-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              Add First Product
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

  const handleSubmitProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingProduct) {
      try {
        await updateProduct(editingProduct.id, productData);
        setIsModalOpen(false);
        setEditingProduct(null);
        showToast('success', 'Product updated successfully');
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
      showToast('success', 'Product added successfully');
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
        showToast('error', 'Could not reach the server. Try again when connected.');
      }
    } catch {
      showToast('error', 'Sync failed. Check your connection and try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight mb-1">Inventory</h1>
          <p className="text-slate-500 text-sm mb-2">
            Products, suppliers, locations and stock levels
          </p>
          <p className="text-slate-500 text-sm">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
            {filteredProducts.length !== products.length && ` (of ${products.length} total)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncToServer}
            disabled={isSyncing || products.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Push items recorded only in this browser to the server so they appear everywhere"
          >
            {isSyncing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
            {isSyncing ? 'Syncing…' : 'Sync recorded items to server'}
          </button>
          {canCreate && (
            <button
              onClick={handleAddProduct}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </button>
          )}
        </div>
      </div>

      {/* Search and View Toggle */}
      <div className="flex gap-4 animate-fade-in-up">
        <div className="flex-1">
          <InventorySearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <div className="flex items-center gap-1 bg-glass rounded-xl border-glass p-1 backdrop-blur-xl">
          <button
            onClick={() => setViewMode('table')}
            className={`p-2.5 rounded-md transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center ${
              viewMode === 'table' 
                ? 'bg-primary-500/10 text-primary-600 shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100/50'
            }`}
            title="Table View"
            aria-label="Switch to table view"
            aria-pressed={viewMode === 'table'}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2.5 rounded-md transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center ${
              viewMode === 'grid' 
                ? 'bg-primary-500/10 text-primary-600 shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100/50'
            }`}
            title="Grid View"
            aria-label="Switch to grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
            <div className="glass-card bg-primary-50/80 border-primary-200/50 animate-fade-in-up">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-primary-900">
                  {selectedIds.length} product{selectedIds.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-white/90 text-slate-700 rounded-lg hover:bg-white transition-all duration-200 flex items-center gap-2 text-sm font-semibold shadow-sm hover:shadow-md border border-slate-200/50"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                  {canDelete && (
                    <button
                      onClick={handleBulkDelete}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 flex items-center gap-2 text-sm font-semibold shadow-sm hover:shadow-md"
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
            <div className="glass-card text-center p-12">
              <Package className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Products Match Your Filters</h3>
              <p className="text-slate-600 mb-4">
                Try adjusting your search or filters to see more products.
              </p>
              {(searchQuery || Object.keys(filters).length > 0) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilters({});
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
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
