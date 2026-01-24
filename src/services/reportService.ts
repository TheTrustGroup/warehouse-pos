import { Product, Transaction } from '../types';
import { formatDate } from '../lib/utils';

export interface SalesReport {
  totalRevenue: number;
  totalProfit: number;
  totalTransactions: number;
  totalItemsSold: number;
  averageOrderValue: number;
  topSellingProducts: Array<{
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
  salesByCategory: Array<{
    category: string;
    revenue: number;
    quantity: number;
  }>;
  salesByDay: Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>;
}

export interface InventoryReport {
  totalProducts: number;
  totalStockValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  productsByCategory: Array<{
    category: string;
    count: number;
    value: number;
  }>;
  topValueProducts: Array<{
    name: string;
    quantity: number;
    value: number;
  }>;
}

export function generateSalesReport(
  transactions: Transaction[],
  products: Product[],
  startDate: Date,
  endDate: Date
): SalesReport {
  const filteredTransactions = transactions.filter(t => {
    const tDate = new Date(t.createdAt);
    return tDate >= startDate && tDate <= endDate && t.status === 'completed';
  });

  const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
  const totalTransactions = filteredTransactions.length;
  const totalItemsSold = filteredTransactions.reduce(
    (sum, t) => sum + t.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );

  // Calculate profit
  let totalProfit = 0;
  filteredTransactions.forEach(transaction => {
    transaction.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const profit = (item.unitPrice - product.costPrice) * item.quantity;
        totalProfit += profit;
      }
    });
  });

  const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Top selling products
  const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  filteredTransactions.forEach(t => {
    t.items.forEach(item => {
      const existing = productSales.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.subtotal;
      } else {
        productSales.set(item.productId, {
          name: item.productName,
          quantity: item.quantity,
          revenue: item.subtotal,
        });
      }
    });
  });

  const topSellingProducts = Array.from(productSales.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)
    .map(p => ({
      productName: p.name,
      quantitySold: p.quantity,
      revenue: p.revenue,
    }));

  // Sales by category
  const categorySales = new Map<string, { revenue: number; quantity: number }>();
  filteredTransactions.forEach(t => {
    t.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const existing = categorySales.get(product.category);
        if (existing) {
          existing.revenue += item.subtotal;
          existing.quantity += item.quantity;
        } else {
          categorySales.set(product.category, {
            revenue: item.subtotal,
            quantity: item.quantity,
          });
        }
      }
    });
  });

  const salesByCategory = Array.from(categorySales.entries())
    .map(([category, data]) => ({
      category,
      revenue: data.revenue,
      quantity: data.quantity,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Sales by day
  const dailySales = new Map<string, { revenue: number; transactions: number }>();
  filteredTransactions.forEach(t => {
    const dateKey = formatDate(t.createdAt);
    const existing = dailySales.get(dateKey);
    if (existing) {
      existing.revenue += t.total;
      existing.transactions += 1;
    } else {
      dailySales.set(dateKey, { revenue: t.total, transactions: 1 });
    }
  });

  const salesByDay = Array.from(dailySales.entries())
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      transactions: data.transactions,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    totalRevenue,
    totalProfit,
    totalTransactions,
    totalItemsSold,
    averageOrderValue,
    topSellingProducts,
    salesByCategory,
    salesByDay,
  };
}

export function generateInventoryReport(products: Product[]): InventoryReport {
  const totalProducts = products.length;
  const totalStockValue = products.reduce((sum, p) => sum + p.quantity * p.costPrice, 0);
  const lowStockItems = products.filter(p => p.quantity > 0 && p.quantity <= p.reorderLevel).length;
  const outOfStockItems = products.filter(p => p.quantity === 0).length;

  // Products by category
  const categoryStats = new Map<string, { count: number; value: number }>();
  products.forEach(p => {
    const existing = categoryStats.get(p.category);
    const value = p.quantity * p.costPrice;
    if (existing) {
      existing.count += 1;
      existing.value += value;
    } else {
      categoryStats.set(p.category, { count: 1, value });
    }
  });

  const productsByCategory = Array.from(categoryStats.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      value: data.value,
    }))
    .sort((a, b) => b.value - a.value);

  // Top value products
  const topValueProducts = [...products]
    .map(p => ({
      name: p.name,
      quantity: p.quantity,
      value: p.quantity * p.costPrice,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    totalProducts,
    totalStockValue,
    lowStockItems,
    outOfStockItems,
    productsByCategory,
    topValueProducts,
  };
}

export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${formatDate(new Date())}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}
