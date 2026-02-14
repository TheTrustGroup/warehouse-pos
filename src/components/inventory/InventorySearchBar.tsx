import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { debounce } from '../../lib/utils';
import { Button } from '../ui/Button';

interface InventorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Visible label (always shown for form usability). */
  label?: string;
}

export function InventorySearchBar({ value, onChange, placeholder = 'Search products, SKU, barcode...', label = 'Search' }: InventorySearchBarProps) {
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
    <div>
      {label && <span className="block text-sm font-medium text-slate-600 mb-1.5">{label}</span>}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" aria-hidden />
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          className="input-field w-full pl-11 pr-11 min-h-touch"
          aria-label={label || 'Search products'}
        />
        {localValue && (
          <Button
            type="button"
            variant="action"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-touch min-h-touch flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
