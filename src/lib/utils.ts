export function generateSKU(prefix: string = 'SKU'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function generateTransactionNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${year}${month}${day}-${random}`;
}

/**
 * Formats a number as Ghana Cedis currency.
 * Safe for undefined/null/NaN (returns ₵0.00). Never throws or logs.
 */
export function formatCurrency(amount: number | undefined | null): string {
  const n = amount == null ? 0 : Number(amount);
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return '₵0.00';
  }
  try {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n).replace('GHS', '₵');
  } catch {
    return '₵0.00';
  }
}

/**
 * Normalize category to a display string (API may return object { id, name, slug }).
 */
export function getCategoryDisplay(category: unknown): string {
  if (category == null) return '';
  if (typeof category === 'string') return category;
  if (typeof category === 'object' && category !== null && 'name' in category && typeof (category as { name?: string }).name === 'string') {
    return (category as { name: string }).name;
  }
  if (typeof category === 'object' && category !== null && 'slug' in category && typeof (category as { slug?: string }).slug === 'string') {
    return (category as { slug: string }).slug;
  }
  return String(category);
}

/** Default location shape when API omits it */
const DEFAULT_LOCATION = { warehouse: 'Main Store', aisle: '', rack: '', bin: '' };

/**
 * Safe location display string (API may omit location or return partial).
 */
export function getLocationDisplay(location: { aisle?: string; rack?: string; bin?: string } | null | undefined): string {
  if (location == null) return '—';
  const a = location.aisle ?? '';
  const r = location.rack ?? '';
  const b = location.bin ?? '';
  const s = [a, r, b].filter(Boolean).join('-');
  return s || '—';
}

/**
 * Ensure product has a location object (for API responses that omit it).
 */
export function normalizeProductLocation<T extends { location?: unknown }>(p: T): T & { location: { warehouse: string; aisle: string; rack: string; bin: string } } {
  const loc = p.location && typeof p.location === 'object' && !Array.isArray(p.location)
    ? (p.location as { warehouse?: string; aisle?: string; rack?: string; bin?: string })
    : null;
  return {
    ...p,
    location: {
      warehouse: loc?.warehouse ?? DEFAULT_LOCATION.warehouse,
      aisle: loc?.aisle ?? '',
      rack: loc?.rack ?? '',
      bin: loc?.bin ?? '',
    },
  };
}

/**
 * Safely formats a date
 * @param date - Date object or string
 * @returns Formatted date string or empty string if invalid
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      console.error('Invalid date for formatting:', date);
      return '';
    }
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch (error) {
    console.error('Error formatting date:', date, error);
    return '';
  }
}

/**
 * Safely formats a date with time
 * @param date - Date object or string
 * @returns Formatted date-time string or empty string if invalid
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      console.error('Invalid date for formatting:', date);
      return '';
    }
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch (error) {
    console.error('Error formatting date-time:', date, error);
    return '';
  }
}

/**
 * Human-readable relative time (e.g. "just now", "2 min ago") for sync health display.
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day !== 1 ? 's' : ''} ago`;
}

/**
 * Calculates percentage change between two values
 * @param current - Current value
 * @param previous - Previous value
 * @returns Percentage change (rounded to 2 decimal places)
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  const change = ((current - previous) / previous) * 100;
  return Math.round(change * 100) / 100;
}

/**
 * Safely calculates total with proper decimal precision
 * @param items - Array of items with unitPrice and quantity
 * @returns Total amount rounded to 2 decimal places
 */
export function calculateTotal(items: Array<{ unitPrice: number; quantity: number }>): number {
  if (!items || items.length === 0) return 0;
  
  const subtotal = items.reduce((sum, item) => {
    const itemTotal = (item.unitPrice || 0) * (item.quantity || 0);
    // Use integer math to avoid floating point errors
    return sum + Math.round(itemTotal * 100);
  }, 0);
  
  // Convert back to decimal and round to 2 places
  return Math.round(subtotal) / 100;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
