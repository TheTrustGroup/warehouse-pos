import { useState } from 'react';
import { Tag, Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface Category {
  id: string;
  name: string;
  productCount: number;
  createdAt: Date;
}

export function CategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([
    { id: '1', name: 'Boys Clothing', productCount: 45, createdAt: new Date() },
    { id: '2', name: 'Girls Clothing', productCount: 52, createdAt: new Date() },
    { id: '3', name: 'Footwear', productCount: 28, createdAt: new Date() },
    { id: '4', name: 'Accessories', productCount: 15, createdAt: new Date() },
    { id: '5', name: 'Baby Clothing', productCount: 33, createdAt: new Date() },
  ]);

  const [newCategory, setNewCategory] = useState('');

  const addCategory = () => {
    if (newCategory.trim()) {
      setCategories([
        ...categories,
        {
          id: Date.now().toString(),
          name: newCategory,
          productCount: 0,
          createdAt: new Date(),
        },
      ]);
      setNewCategory('');
    }
  };

  const deleteCategory = (id: string) => {
    const category = categories.find(c => c.id === id);
    if (category && category.productCount > 0) {
      alert('Cannot delete category with products. Please reassign products first.');
      return;
    }
    if (confirm('Delete this category?')) {
      setCategories(categories.filter(c => c.id !== id));
    }
  };

  return (
    <div className="solid-card animate-fade-in-up">
      <div className="flex items-center gap-3 mb-6">
        <Tag className="w-6 h-6 text-primary-600" />
        <h2 className="text-xl font-bold text-slate-900">Category Management</h2>
      </div>

      {/* Add Category */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && addCategory()}
          placeholder="Enter new category name..."
          className="flex-1 input-field"
        />
        <Button type="button" variant="primary" onClick={addCategory} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>

      {/* Categories List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {categories.map(category => (
          <div
            key={category.id}
            className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div>
              <p className="font-medium text-slate-900">{category.name}</p>
              <p className="text-sm text-slate-500">{category.productCount} products</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="actionEdit" className="p-2 min-h-0">
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => deleteCategory(category.id)}
                className="p-2 min-h-0"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
