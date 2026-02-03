import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  calculateTotal,
  calculatePercentageChange,
  generateTransactionNumber,
  getCategoryDisplay,
  getLocationDisplay,
  normalizeProductLocation,
} from './utils';

describe('formatCurrency', () => {
  it('formats positive number as GHS', () => {
    expect(formatCurrency(100)).toMatch(/₵|100/);
    expect(formatCurrency(0.5)).toMatch(/0\.50/);
  });
  it('returns ₵0.00 for 0, null, undefined, NaN', () => {
    expect(formatCurrency(0)).toContain('0');
    expect(formatCurrency(null)).toContain('0');
    expect(formatCurrency(undefined)).toContain('0');
    expect(formatCurrency(NaN)).toContain('0');
  });
});

describe('calculateTotal', () => {
  it('returns 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });
  it('sums unitPrice * quantity with 2 decimal precision', () => {
    expect(calculateTotal([{ unitPrice: 10, quantity: 2 }])).toBe(20);
    expect(calculateTotal([{ unitPrice: 10.99, quantity: 2 }])).toBe(21.98);
    expect(calculateTotal([{ unitPrice: 1, quantity: 1 }, { unitPrice: 2, quantity: 3 }])).toBe(7);
  });
});

describe('calculatePercentageChange', () => {
  it('returns 100 when previous is 0 and current > 0', () => {
    expect(calculatePercentageChange(10, 0)).toBe(100);
  });
  it('returns 0 when previous is 0 and current is 0', () => {
    expect(calculatePercentageChange(0, 0)).toBe(0);
  });
  it('computes percentage change correctly', () => {
    expect(calculatePercentageChange(110, 100)).toBe(10);
    expect(calculatePercentageChange(90, 100)).toBe(-10);
  });
});

describe('generateTransactionNumber', () => {
  it('starts with TXN- and has date + random part', () => {
    const n = generateTransactionNumber();
    expect(n).toMatch(/^TXN-\d{6}-[A-Z0-9]+$/);
  });
});

describe('getCategoryDisplay', () => {
  it('returns string category as-is', () => {
    expect(getCategoryDisplay('Electronics')).toBe('Electronics');
  });
  it('returns name from object', () => {
    expect(getCategoryDisplay({ name: 'Electronics' })).toBe('Electronics');
  });
  it('returns empty string for null/undefined', () => {
    expect(getCategoryDisplay(null)).toBe('');
    expect(getCategoryDisplay(undefined)).toBe('');
  });
});

describe('getLocationDisplay', () => {
  it('returns — for null/undefined', () => {
    expect(getLocationDisplay(null)).toBe('—');
    expect(getLocationDisplay(undefined)).toBe('—');
  });
  it('joins aisle, rack, bin', () => {
    expect(getLocationDisplay({ aisle: 'A', rack: '1', bin: '2' })).toBe('A-1-2');
  });
});

describe('normalizeProductLocation', () => {
  it('fills missing location with default warehouse', () => {
    const out = normalizeProductLocation({ name: 'P' } as { location?: unknown });
    expect(out.location).toEqual({ warehouse: 'Main Store', aisle: '', rack: '', bin: '' });
  });
  it('preserves existing location fields', () => {
    const out = normalizeProductLocation({
      location: { warehouse: 'W2', aisle: 'A', rack: 'R', bin: 'B' },
    } as { location?: { warehouse?: string; aisle?: string; rack?: string; bin?: string } });
    expect(out.location).toEqual({ warehouse: 'W2', aisle: 'A', rack: 'R', bin: 'B' });
  });
});
