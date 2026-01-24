import { Product, InventoryActivity, DashboardStats } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mock products
export const mockProducts: Product[] = [
  {
    id: uuidv4(),
    sku: 'SKU-2024-001',
    barcode: '1234567890123',
    name: 'Boys T-Shirt - Blue',
    description: 'Cotton t-shirt for boys, size 8-10 years',
    category: 'Boys Clothing',
    tags: ['boys', 'clothing', 't-shirt'],
    quantity: 45,
    costPrice: 25,
    sellingPrice: 55,
    reorderLevel: 10,
    location: { warehouse: 'Main Store', aisle: 'A', rack: '1', bin: '5' },
    supplier: { name: 'KidsFashion Ghana', contact: '+233241234567', email: 'sales@kidsfashion.gh' },
    images: ['https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=400'],
    expiryDate: null,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date(),
    createdBy: 'admin',
  },
  {
    id: uuidv4(),
    sku: 'SKU-2024-002',
    barcode: '1234567890124',
    name: 'Girls Dress - Pink',
    description: 'Floral dress for girls, age 5-7 years',
    category: 'Girls Clothing',
    tags: ['girls', 'clothing', 'dress'],
    quantity: 8,
    costPrice: 40,
    sellingPrice: 85,
    reorderLevel: 15,
    location: { warehouse: 'Main Store', aisle: 'B', rack: '2', bin: '3' },
    supplier: { name: 'Pretty Kids Ltd', contact: '+233201234567', email: 'info@prettykids.gh' },
    images: ['https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?w=400'],
    expiryDate: null,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date(),
    createdBy: 'admin',
  },
  {
    id: uuidv4(),
    sku: 'SKU-2024-003',
    barcode: '1234567890125',
    name: 'Kids Sneakers - White',
    description: 'Comfortable sneakers for kids, size 32',
    category: 'Footwear',
    tags: ['shoes', 'sneakers', 'unisex'],
    quantity: 22,
    costPrice: 60,
    sellingPrice: 120,
    reorderLevel: 5,
    location: { warehouse: 'Main Store', aisle: 'C', rack: '1', bin: '2' },
    supplier: { name: 'Shoe Palace Ghana', contact: '+233501234567', email: 'orders@shoepalace.gh' },
    images: ['https://images.unsplash.com/photo-1514989940723-e8e51635b782?w=400'],
    expiryDate: null,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date(),
    createdBy: 'admin',
  },
  {
    id: uuidv4(),
    sku: 'SKU-2024-004',
    barcode: '1234567890126',
    name: 'School Backpack - Red',
    description: 'Durable backpack for school kids',
    category: 'Accessories',
    tags: ['bag', 'school', 'accessories'],
    quantity: 0,
    costPrice: 35,
    sellingPrice: 75,
    reorderLevel: 8,
    location: { warehouse: 'Main Store', aisle: 'D', rack: '3', bin: '1' },
    supplier: { name: 'Bags & More', contact: '+233261234567', email: 'sales@bagsandmore.gh' },
    images: ['https://images.unsplash.com/photo-1577655197620-704858b270ac?w=400'],
    expiryDate: null,
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date(),
    createdBy: 'manager',
  },
  {
    id: uuidv4(),
    sku: 'SKU-2024-005',
    barcode: '1234567890127',
    name: 'Baby Onesie - Yellow',
    description: 'Soft cotton onesie for babies 0-12 months',
    category: 'Baby Clothing',
    tags: ['baby', 'clothing', 'onesie'],
    quantity: 15,
    costPrice: 20,
    sellingPrice: 45,
    reorderLevel: 10,
    location: { warehouse: 'Main Store', aisle: 'A', rack: '1', bin: '8' },
    supplier: { name: 'Baby Essentials GH', contact: '+233271234567', email: 'contact@babyessentials.gh' },
    images: ['https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400'],
    expiryDate: null,
    createdAt: new Date('2024-02-15'),
    updatedAt: new Date(),
    createdBy: 'admin',
  },
];

// Generate mock dashboard stats
export function getMockDashboardStats(): DashboardStats {
  const totalProducts = mockProducts.length;
  const totalStockValue = mockProducts.reduce((sum, p) => sum + (p.quantity * p.costPrice), 0);
  const lowStockItems = mockProducts.filter(p => p.quantity > 0 && p.quantity <= p.reorderLevel).length;
  const outOfStockItems = mockProducts.filter(p => p.quantity === 0).length;
  
  return {
    totalProducts,
    totalStockValue,
    lowStockItems,
    outOfStockItems,
    todaySales: 2847.50,
    todayTransactions: 23,
    monthSales: 68543.80,
    topProducts: [
      { id: '1', name: 'Boys T-Shirt - Blue', sales: 45, revenue: 2475.00 },
      { id: '2', name: 'Kids Sneakers - White', sales: 18, revenue: 2160.00 },
      { id: '3', name: 'Girls Dress - Pink', sales: 12, revenue: 1020.00 },
      { id: '4', name: 'Baby Onesie - Yellow', sales: 67, revenue: 3015.00 },
      { id: '5', name: 'School Backpack - Red', sales: 8, revenue: 600.00 },
    ],
  };
}

// Generate mock sales data for charts
export function getMockSalesData() {
  return [
    { date: 'Jan 17', sales: 42, revenue: 3850 },
    { date: 'Jan 18', sales: 38, revenue: 3200 },
    { date: 'Jan 19', sales: 55, revenue: 5100 },
    { date: 'Jan 20', sales: 48, revenue: 4650 },
    { date: 'Jan 21', sales: 63, revenue: 6100 },
    { date: 'Jan 22', sales: 51, revenue: 4950 },
    { date: 'Jan 23', sales: 28, revenue: 2850 },
  ];
}

export function getMockCategoryData() {
  return [
    { name: 'Boys Clothing', value: 35, count: 125 },
    { name: 'Girls Clothing', value: 30, count: 110 },
    { name: 'Footwear', value: 20, count: 65 },
    { name: 'Accessories', value: 10, count: 45 },
    { name: 'Baby Clothing', value: 5, count: 30 },
  ];
}

export function getMockRecentActivity(): InventoryActivity[] {
  return [
    {
      id: uuidv4(),
      productId: mockProducts[0].id,
      productName: 'Boys T-Shirt - Blue',
      sku: 'SKU-2024-001',
      action: 'sale',
      quantityBefore: 50,
      quantityAfter: 45,
      quantityChanged: -5,
      reason: 'POS Sale',
      performedBy: 'cashier1',
      timestamp: new Date('2026-01-23T10:30:00'),
    },
    {
      id: uuidv4(),
      productId: mockProducts[2].id,
      productName: 'Kids Sneakers - White',
      sku: 'SKU-2024-003',
      action: 'update',
      quantityBefore: 20,
      quantityAfter: 22,
      quantityChanged: 2,
      reason: 'Stock adjustment',
      performedBy: 'manager',
      timestamp: new Date('2026-01-23T09:15:00'),
    },
    {
      id: uuidv4(),
      productId: mockProducts[1].id,
      productName: 'Girls Dress - Pink',
      sku: 'SKU-2024-002',
      action: 'sale',
      quantityBefore: 15,
      quantityAfter: 8,
      quantityChanged: -7,
      reason: 'POS Sale',
      performedBy: 'cashier1',
      timestamp: new Date('2026-01-23T08:45:00'),
    },
  ];
}
