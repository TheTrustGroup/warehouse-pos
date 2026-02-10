export interface Warehouse {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  location: {
    warehouse: string;
    aisle: string;
    rack: string;
    bin: string;
  };
  supplier: {
    name: string;
    contact: string;
    email: string;
  };
  images: string[];
  expiryDate: Date | null;
  variants?: {
    size?: string;
    color?: string;
    unit?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  /** Optional version for optimistic locking; backend may return and require on update. */
  version?: number;
}

export interface Transaction {
  id: string;
  transactionNumber: string;
  type: 'sale' | 'return' | 'transfer';
  items: TransactionItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'mobile_money' | 'mixed';
  payments: Payment[];
  cashier: string;
  customer?: Customer;
  status: 'pending' | 'completed' | 'cancelled';
  syncStatus: 'synced' | 'pending' | 'offline';
  createdAt: Date;
  completedAt: Date | null;
  /** Warehouse (location) where the sale occurred; used for inventory deduction and reporting. */
  warehouseId?: string;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Payment {
  method: 'cash' | 'card' | 'mobile_money';
  amount: number;
}

export interface Customer {
  name: string;
  phone: string;
  email: string;
}

export interface InventoryActivity {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  action: 'add' | 'update' | 'sale' | 'return' | 'adjustment' | 'transfer';
  quantityBefore: number;
  quantityAfter: number;
  quantityChanged: number;
  reason: string;
  performedBy: string;
  relatedTransactionId?: string;
  timestamp: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'cashier' | 'warehouse' | 'driver' | 'viewer';
  fullName: string;
  avatar?: string;
  permissions: string[];
  isActive: boolean;
  lastLogin: Date;
  createdAt: Date;
}

export interface DashboardStats {
  totalProducts: number;
  totalStockValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  todaySales: number;
  todayTransactions: number;
  monthSales: number;
  topProducts: Array<{
    id: string;
    name: string;
    sales: number;
    revenue: number;
  }>;
}
