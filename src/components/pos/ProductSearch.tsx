import { useState, useEffect, useRef } from 'react';
import { Search, Scan, Package } from 'lucide-react';
import { useInventory } from '../../contexts/InventoryContext';
import { usePOS } from '../../contexts/POSContext';
import { formatCurrency } from '../../lib/utils';

export function ProductSearch() {
  const { products } = useInventory();
  const { addToCart } = usePOS();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState(products);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const categories = Array.from(new Set(products.map(p => p.category)));

  useEffect(() => {
    let filtered = products.filter(p => p.quantity > 0);

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    setFilteredProducts(filtered);
  }, [searchQuery, selectedCategory, products]);

  const handleProductClick = (productId: string) => {
    addToCart(productId, 1);
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" strokeWidth={2} />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name, SKU, or scan barcode... (Press /)"
          className="input-field w-full pl-12 pr-14 text-base"
        />
        <button className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-primary-50/80 text-primary-600 rounded-lg hover:bg-primary-100/80 transition-all duration-200 backdrop-blur-sm">
          <Scan className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory('')}
          className={`px-4 py-2 rounded-xl whitespace-nowrap font-semibold transition-all duration-200 ${
            selectedCategory === ''
              ? 'btn-primary'
              : 'btn-secondary'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl whitespace-nowrap font-semibold transition-all duration-200 ${
              selectedCategory === cat
                ? 'btn-primary'
                : 'btn-secondary'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[calc(100vh-350px)] overflow-y-auto">
        {filteredProducts.map(product => (
          <button
            key={product.id}
            onClick={() => handleProductClick(product.id)}
            className="glass-card p-4 hover:-translate-y-0.5 transition-all duration-200 text-left group"
          >
            {product.images[0] ? (
              <img
                src={product.images[0]}
                alt={product.name}
                loading="lazy"
                className="w-full h-28 object-cover rounded-xl mb-3 group-hover:scale-105 transition-transform duration-300 shadow-md"
              />
            ) : (
              <div className="w-full h-28 bg-slate-100/80 rounded-xl mb-3 flex items-center justify-center border border-slate-200/50">
                <Package className="w-10 h-10 text-slate-400" strokeWidth={2} />
              </div>
            )}
            <h3 className="font-semibold text-sm text-slate-900 line-clamp-2 mb-2">
              {product.name}
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold gradient-text">
                {formatCurrency(product.sellingPrice)}
              </span>
              <span className="badge badge-info text-xs">
                {product.quantity} left
              </span>
            </div>
          </button>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">No products found</p>
        </div>
      )}
    </div>
  );
}
