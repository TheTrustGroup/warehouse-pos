import { useState, useEffect } from 'react';
import { Product } from '../../types';
import { generateSKU, getCategoryDisplay } from '../../lib/utils';
import { useWarehouse } from '../../contexts/WarehouseContext';
import { X, Upload } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { warehouseId?: string }) => void | Promise<void>;
  product?: Product | null;
}

export function ProductFormModal({ isOpen, onClose, onSubmit, product }: ProductFormModalProps) {
  const { warehouses, currentWarehouseId } = useWarehouse();
  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    name: '',
    description: '',
    category: '',
    tags: [] as string[],
    quantity: 0,
    costPrice: 0,
    sellingPrice: 0,
    reorderLevel: 0,
    warehouseId: '' as string,
    location: {
      warehouse: 'Main Store',
      aisle: '',
      rack: '',
      bin: '',
    },
    supplier: {
      name: '',
      contact: '',
      email: '',
    },
    images: [] as string[],
    expiryDate: null as Date | null,
    variants: {} as { size?: string; color?: string; unit?: string },
    createdBy: 'admin',
  });

  const [tagInput, setTagInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData({
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        description: product.description,
        category: getCategoryDisplay(product.category),
        tags: product.tags,
        quantity: product.quantity,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        reorderLevel: product.reorderLevel,
        warehouseId: (product as any).warehouseId ?? currentWarehouseId,
        location: product.location && typeof product.location === 'object'
          ? { warehouse: (product.location as any).warehouse ?? 'Main Store', aisle: (product.location as any).aisle ?? '', rack: (product.location as any).rack ?? '', bin: (product.location as any).bin ?? '' }
          : { warehouse: 'Main Store', aisle: '', rack: '', bin: '' },
        supplier: product.supplier && typeof product.supplier === 'object'
          ? { name: (product.supplier as any).name ?? '', contact: (product.supplier as any).contact ?? '', email: (product.supplier as any).email ?? '' }
          : { name: '', contact: '', email: '' },
        images: product.images,
        expiryDate: product.expiryDate,
        variants: product.variants || {},
        createdBy: product.createdBy,
      });
      setImagePreview(product.images);
    } else {
      // Reset form for new product
      setFormData({
        sku: generateSKU(),
        barcode: '',
        name: '',
        description: '',
        category: '',
        tags: [],
        quantity: 0,
        costPrice: 0,
        sellingPrice: 0,
        reorderLevel: 0,
        warehouseId: currentWarehouseId,
        location: { warehouse: 'Main Store', aisle: '', rack: '', bin: '' },
        supplier: { name: '', contact: '', email: '' },
        images: [],
        expiryDate: null,
        variants: {},
        createdBy: 'admin',
      });
      setImagePreview([]);
    }
  }, [product, isOpen, currentWarehouseId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setFormData(prev => ({ ...prev, images: [...prev.images, result] }));
        setImagePreview(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
    setImagePreview(prev => prev.filter((_, i) => i !== index));
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await Promise.resolve(onSubmit(formData));
      onClose();
    } catch {
      // Parent shows toast; keep modal open
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const lock = () => document.body.classList.add('scroll-lock');
    const unlock = () => document.body.classList.remove('scroll-lock');
    lock();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unlock();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /* Modal: one primary action = Save/Update; Cancel secondary. Backdrop click + Escape close. Scroll lock when open. */
  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay-padding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
      onClick={() => onClose()}
    >
      <div
        className="glass rounded-2xl shadow-large max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 glass border-b border-slate-200/50 px-6 py-4 flex items-center justify-between z-10">
          <h2 id="product-form-title" className="text-xl font-bold text-slate-900 tracking-tight">
            {product ? 'Edit product' : 'Add product'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-action rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 lg:p-8 space-y-6 overflow-y-auto flex-1">
          {/* Basic info: labels calm (font-medium), inputs min-h-touch */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Product name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                SKU *
              </label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Barcode
              </label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Category *
              </label>
              <input
                type="text"
                required
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="input-field"
                placeholder="e.g., Electronics, Office"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input-field"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Quantity *
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Cost price *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.costPrice}
                onChange={(e) => setFormData(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Selling price *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.sellingPrice}
                onChange={(e) => setFormData(prev => ({ ...prev, sellingPrice: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Reorder level *
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.reorderLevel}
                onChange={(e) => setFormData(prev => ({ ...prev, reorderLevel: Number(e.target.value) }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Warehouse *
              </label>
              <select
                required
                value={formData.warehouseId || currentWarehouseId}
                onChange={(e) => {
                  const id = e.target.value;
                  const wh = warehouses.find((w) => w.id === id);
                  setFormData(prev => ({
                    ...prev,
                    warehouseId: id,
                    location: { ...prev.location, warehouse: wh?.name ?? prev.location.warehouse },
                  }));
                }}
                className="input-field"
              >
                {warehouses.length === 0 ? (
                  <option value={currentWarehouseId}>Main Store</option>
                ) : (
                  warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Aisle
              </label>
              <input
                type="text"
                value={formData.location.aisle}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  location: { ...prev.location, aisle: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Rack
              </label>
              <input
                type="text"
                value={formData.location.rack}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  location: { ...prev.location, rack: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Bin
              </label>
              <input
                type="text"
                value={formData.location.bin}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  location: { ...prev.location, bin: e.target.value }
                }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Supplier name
              </label>
              <input
                type="text"
                value={formData.supplier.name}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  supplier: { ...prev.supplier, name: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Contact
              </label>
              <input
                type="text"
                value={formData.supplier.contact}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  supplier: { ...prev.supplier, contact: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={formData.supplier.email}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  supplier: { ...prev.supplier, email: e.target.value }
                }))}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="input-field flex-1"
                placeholder="Add a tag and press Enter"
              />
              <button
                type="button"
                onClick={addTag}
                className="btn-secondary"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="badge badge-info inline-flex items-center gap-1.5"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-blue-900 transition-colors text-base leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Product images
            </label>
            <div className="flex flex-wrap gap-4 mb-4">
              {imagePreview.map((img, index) => (
                <div key={index} className="relative">
                  <img src={img} alt={`Preview ${index}`} className="w-24 h-24 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 min-h-touch px-4 py-2.5 border border-slate-200/80 rounded-xl cursor-pointer hover:bg-slate-50 w-fit transition-colors text-sm font-medium text-slate-700">
              <Upload className="w-5 h-5 text-slate-600" />
              <span>Upload images</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* One primary action = Save; Cancel secondary, de-emphasized */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/50 sticky bottom-0 bg-white/90 backdrop-blur-md -mx-6 lg:-mx-8 px-6 lg:px-8 pb-6">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : product ? 'Update product' : 'Add product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
