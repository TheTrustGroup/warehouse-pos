import { useState, useMemo } from 'react';
import { useInventory, ProductFilters } from '../contexts/InventoryContext';
import { ProductTableView } from '../components/inventory/ProductTableView';
import { ProductGridView } from '../components/inventory/ProductGridView';
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { InventoryFilters } from '../components/inventory/InventoryFilters';
import { InventorySearchBar } from '../components/inventory/InventorySearchBar';
import { Product } from '../types';
import { Plus, LayoutGrid, List, Trash2, Download } from 'lucide-react';

type ViewMode = 'table' | 'grid';

export function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct, deleteProducts, searchProducts, filterProducts } = useInventory();
  
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ProductFilters>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Get unique categories
  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category))).sort();
  }, [products]);

  // Filter and search products
  const filteredProducts = useMemo(() => {
    let result = products;

    // Apply search
    if (searchQuery.trim()) {
      result = searchProducts(searchQuery);
    }

    // Apply filters
    if (Object.keys(filters).length > 0) {
      const filtered = filterProducts(filters);
      // If we have a search query, intersect results
      if (searchQuery.trim()) {
        const searchIds = new Set(result.map(p => p.id));
        result = filtered.filter(p => searchIds.has(p.id));
      } else {
        result = filtered;
      }
    }

    return result;
  }, [products, searchQuery, filters, searchProducts, filterProducts]);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleViewProduct = (product: Product) => {
    // For now, just open edit modal. Can be enhanced with a view-only modal later
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      deleteProduct(id);
      setSelectedIds(prev => prev.filter(sid => sid !== id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.length} product(s)?`)) {
      deleteProducts(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleSubmitProduct = (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingProduct) {
      updateProduct(editingProduct.id, productData);
    } else {
      addProduct(productData);
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleExport = () => {
    // Simple CSV export
    const headers = ['SKU', 'Name', 'Category', 'Quantity', 'Cost Price', 'Selling Price', 'Location'];
    const rows = filteredProducts.map(p => [
      p.sku,
      p.name,
      p.category,
      p.quantity,
      p.costPrice,
      p.sellingPrice,
      `${p.location.aisle}-${p.location.rack}-${p.location.bin}`
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight mb-2">Inventory</h1>
          <p className="text-slate-500 text-sm">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <button
          onClick={handleAddProduct}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Product
        </button>
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
          {selectedIds.length > 0 && (
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
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 flex items-center gap-2 text-sm font-semibold shadow-sm hover:shadow-md"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Products Display */}
          {viewMode === 'table' ? (
            <ProductTableView
              products={filteredProducts}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
              onView={handleViewProduct}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
            />
          ) : (
            <ProductGridView
              products={filteredProducts}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
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
