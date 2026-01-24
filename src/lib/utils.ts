import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
 * Formats a number as Ghana Cedis currency
 * @param amount - Amount to format
 * @returns Formatted currency string (e.g., "₵100.00")
 */
export function formatCurrency(amount: number): string {
  if (isNaN(amount)) {
    console.error('Invalid amount for currency formatting:', amount);
    return '₵0.00';
  }
  
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('GHS', '₵');
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
