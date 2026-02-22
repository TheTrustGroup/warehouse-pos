/**
 * Dashboard stats: ensures stock values match recorded products (quantity × costPrice, low/out of stock).
 */
import { describe, it, expect } from 'vitest';
import { computeDashboardStats } from './dashboardStats';

describe('computeDashboardStats', () => {
  it('computes totalProducts as length of products array', () => {
    const products = [
      { quantity: 1, costPrice: 100, reorderLevel: 0 },
      { quantity: 2, costPrice: 50, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.totalProducts).toBe(2);
  });

  it('computes totalStockValue as sum of quantity × costPrice', () => {
    const products = [
      { quantity: 10, costPrice: 100, reorderLevel: 0 },
      { quantity: 5, costPrice: 200, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.totalStockValue).toBe(10 * 100 + 5 * 200); // 2000
  });

  it('counts lowStockItems where quantity > 0 and quantity <= reorderLevel', () => {
    const products = [
      { quantity: 2, costPrice: 10, reorderLevel: 5 },
      { quantity: 0, costPrice: 10, reorderLevel: 1 },
      { quantity: 3, costPrice: 10, reorderLevel: 3 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.lowStockItems).toBe(2); // first and third
  });

  it('counts outOfStockItems where quantity === 0', () => {
    const products = [
      { quantity: 0, costPrice: 10, reorderLevel: 0 },
      { quantity: 1, costPrice: 10, reorderLevel: 0 },
      { quantity: 0, costPrice: 20, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.outOfStockItems).toBe(2);
  });

  it('passes through todaySales and todayTransactions', () => {
    const products: Array<{ quantity?: number; costPrice?: number; reorderLevel?: number }> = [];
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

  it('treats missing quantity/costPrice as 0', () => {
    const products = [
      { quantity: 5, costPrice: 0, reorderLevel: 0 },
      { quantity: undefined, costPrice: 10, reorderLevel: 0 },
    ];
    const result = computeDashboardStats(products, 0, 0);
    expect(result.totalStockValue).toBe(0);
    expect(result.totalProducts).toBe(2);
  });
});
