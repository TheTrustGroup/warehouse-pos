/**
 * Dashboard stats: stock value = quantity × sellingPrice (aligned with API); supports quantityBySize.
 */
import { describe, it, expect } from 'vitest';
import { computeDashboardStats } from './dashboardStats';

describe('computeDashboardStats', () => {
  it('computes totalProducts as length of products array', () => {
    const products = [
      { quantity: 1, sellingPrice: 100, reorderLevel: 0 },
      { quantity: 2, sellingPrice: 50, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.totalProducts).toBe(2);
  });

  it('computes totalStockValue as sum of quantity × sellingPrice', () => {
    const products = [
      { quantity: 10, sellingPrice: 100, reorderLevel: 0 },
      { quantity: 5, sellingPrice: 200, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.totalStockValue).toBe(10 * 100 + 5 * 200); // 2000
  });

  it('uses quantityBySize for sized products', () => {
    const products = [
      { sizeKind: 'sized', quantityBySize: [{ quantity: 2 }, { quantity: 3 }], sellingPrice: 100, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.totalStockValue).toBe(5 * 100); // 500
  });

  it('counts lowStockItems where quantity > 0 and quantity <= reorderLevel', () => {
    const products = [
      { quantity: 2, sellingPrice: 10, reorderLevel: 5 },
      { quantity: 0, sellingPrice: 10, reorderLevel: 1 },
      { quantity: 3, sellingPrice: 10, reorderLevel: 3 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.lowStockItems).toBe(2); // first and third
  });

  it('counts outOfStockItems where quantity === 0', () => {
    const products = [
      { quantity: 0, sellingPrice: 10, reorderLevel: 0 },
      { quantity: 1, sellingPrice: 10, reorderLevel: 0 },
      { quantity: 0, sellingPrice: 20, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.outOfStockItems).toBe(2);
  });

  it('passes through todaySales and todayTransactions', () => {
    const products: Array<{ quantity?: number; sellingPrice?: number; reorderLevel?: number }> = [];
    const result = computeDashboardStats(products, 1500, 12);
    expect(result.todaySales).toBe(1500);
    expect(result.todayTransactions).toBe(12);
  });

  it('handles empty products', () => {
    const result = computeDashboardStats([], 0, 0);
    expect(result.totalProducts).toBe(0);
    expect(result.totalStockValue).toBe(0);
    expect(result.lowStockItems).toBe(0);
    expect(result.outOfStockItems).toBe(0);
  });

  it('treats missing quantity/sellingPrice as 0', () => {
    const products = [
      { quantity: 5, sellingPrice: 0, reorderLevel: 0 },
      { quantity: undefined, sellingPrice: 10, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.totalStockValue).toBe(0);
    expect(result.totalProducts).toBe(2);
  });
});
