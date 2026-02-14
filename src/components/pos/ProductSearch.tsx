import { useState, useEffect, useRef } from 'react';
import { Search, Scan, Package } from 'lucide-react';
import { useInventory } from '../../contexts/InventoryContext';
import { usePOS } from '../../contexts/POSContext';
import { formatCurrency, getCategoryDisplay } from '../../lib/utils';
import { Button } from '../ui/Button';

export function ProductSearch() {
  const { products } = useInventory();
  const { addToCart } = usePOS();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState(products);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const categories = Array.from(new Set(products.map(p => getCategoryDisplay(p.category)))).filter(Boolean);

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
      filtered = filtered.filter(p => getCategoryDisplay(p.category) === selectedCategory);
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
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" aria-hidden />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, SKU, or barcode (/)"
          className="input-field w-full pl-12 pr-12 min-h-touch"
          aria-label="Search products"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
          <Scan className="w-5 h-5" strokeWidth={2} />
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
        <Button
          type="button"
          variant={selectedCategory === '' ? 'primary' : 'secondary'}
          onClick={() => setSelectedCategory('')}
          className="min-h-touch px-4 py-2 rounded-xl whitespace-nowrap flex-shrink-0"
          aria-pressed={selectedCategory === ''}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            type="button"
            variant={selectedCategory === cat ? 'primary' : 'secondary'}
            onClick={() => setSelectedCategory(cat)}
            className="min-h-touch px-4 py-2 rounded-xl whitespace-nowrap flex-shrink-0"
            aria-pressed={selectedCategory === cat}
          >
            {cat}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[calc(100vh-320px)] overflow-y-auto min-h-0">
        {filteredProducts.map((product) => (
          <Button
            key={product.id}
            type="button"
            variant="secondary"
            onClick={() => handleProductClick(product.id)}
            className="glass-card p-3 text-left transition-shadow hover:shadow-card-hover"
          >
            {product.images[0] ? (
              <img
                src={product.images[0]}
                alt=""
                loading="lazy"
                className="w-full h-24 object-cover rounded-lg mb-2"
              />
            ) : (
              <div className="w-full h-24 bg-slate-100 rounded-lg mb-2 flex items-center justify-center">
                <Package className="w-8 h-8 text-slate-400" strokeWidth={2} aria-hidden />
              </div>
            )}
            <h3 className="font-medium text-sm text-slate-900 line-clamp-2 mb-1">{product.name}</h3>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary-600">{formatCurrency(product.sellingPrice)}</span>
              <span className="badge badge-info text-xs">{product.quantity} left</span>
            </div>
</Button>
          ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-10">
          <Package className="w-10 h-10 text-slate-400 mx-auto mb-2" aria-hidden />
          <p className="text-slate-600 text-sm font-medium">No products found</p>
        </div>
      )}
    </div>
  );
}
