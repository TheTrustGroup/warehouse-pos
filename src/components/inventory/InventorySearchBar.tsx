import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { debounce } from '../../lib/utils';

interface InventorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function InventorySearchBar({ value, onChange, placeholder = 'Search products, SKU, barcode...' }: InventorySearchBarProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const debouncedOnChange = debounce((val: string) => {
    onChange(val);
  }, 300);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    debouncedOnChange(newValue);
  };

  const clearSearch = () => {
    setLocalValue('');
    onChange('');
  };

  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="input-field w-full pl-11 pr-11"
      />
      {localValue && (
        <button
          onClick={clearSearch}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100/80 rounded-lg transition-colors duration-200"
        >
          <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
        </button>
      )}
    </div>
  );
}
