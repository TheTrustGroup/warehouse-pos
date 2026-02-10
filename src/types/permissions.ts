/**
 * RBAC: permission strings for UI gating. Backend is the authority — never trust client for role.
 * Cashier: POS + view products/orders only. No dashboard, reports, users, settings, inventory editing.
 */

export const PERMISSIONS = {
  DASHBOARD: {
    VIEW: 'dashboard.view',
  },
  INVENTORY: {
    VIEW: 'inventory.view',
    CREATE: 'inventory.create',
    UPDATE: 'inventory.update',
    DELETE: 'inventory.delete',
    ADJUST_STOCK: 'inventory.adjust_stock',
    VIEW_COST_PRICE: 'inventory.view_cost_price',
    BULK_ACTIONS: 'inventory.bulk_actions',
  },
  POS: {
    ACCESS: 'pos.access',
    APPLY_DISCOUNT: 'pos.apply_discount',
    VOID_TRANSACTION: 'pos.void_transaction',
    PROCESS_REFUND: 'pos.process_refund',
    VIEW_DAILY_SALES: 'pos.view_daily_sales',
    OVERRIDE_PRICE: 'pos.override_price',
  },
  ORDERS: {
    VIEW: 'orders.view',
    CREATE: 'orders.create',
    UPDATE_STATUS: 'orders.update_status',
    CANCEL: 'orders.cancel',
    ASSIGN_DRIVER: 'orders.assign_driver',
    VIEW_ALL: 'orders.view_all',
  },
  REPORTS: {
    VIEW_SALES: 'reports.view_sales',
    VIEW_INVENTORY: 'reports.view_inventory',
    VIEW_PROFIT: 'reports.view_profit',
    VIEW_ACTIVITY_LOG: 'reports.view_activity_log',
    EXPORT: 'reports.export',
  },
  SETTINGS: {
    VIEW: 'settings.view',
    UPDATE_BUSINESS: 'settings.update_business',
    MANAGE_USERS: 'settings.manage_users',
    UPDATE_SYSTEM: 'settings.update_system',
    MANAGE_CATEGORIES: 'settings.manage_categories',
  },
  USERS: {
    VIEW: 'users.view',
    CREATE: 'users.create',
    UPDATE: 'users.update',
    DELETE: 'users.delete',
    ASSIGN_ROLES: 'users.assign_roles',
  },
} as const;

export type Permission = {
  [K in keyof typeof PERMISSIONS]: (typeof PERMISSIONS)[K][keyof (typeof PERMISSIONS)[K]];
}[keyof typeof PERMISSIONS];

export interface RoleLimits {
  maxDiscount?: number;
  maxRefundAmount?: number;
  maxTransactionAmount?: number;
  requireManagerApproval?: {
    discount?: number;
    void?: boolean;
    refund?: boolean;
    priceOverride?: boolean;
  };
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  limits?: RoleLimits;
  isSystem: boolean;
}

const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap(p => Object.values(p));

export const ROLES: Record<string, Role> = {
  SUPER_ADMIN: {
    id: 'super_admin',
    name: 'Super Admin',
    description: 'Full system access; can manage users and assign roles to staff',
    permissions: ALL_PERMISSIONS,
    isSystem: true,
  },
  ADMIN: {
    id: 'admin',
    name: 'Administrator',
    description: 'Full system access',
    permissions: ALL_PERMISSIONS,
    isSystem: true,
  },

  MANAGER: {
    id: 'manager',
    name: 'Store Manager',
    description: 'Manage store operations',
    permissions: [
      PERMISSIONS.DASHBOARD.VIEW,
      ...Object.values(PERMISSIONS.INVENTORY),
      ...Object.values(PERMISSIONS.POS),
      ...Object.values(PERMISSIONS.ORDERS),
      PERMISSIONS.REPORTS.VIEW_SALES,
      PERMISSIONS.REPORTS.VIEW_INVENTORY,
      PERMISSIONS.REPORTS.VIEW_PROFIT,
      PERMISSIONS.REPORTS.EXPORT,
      PERMISSIONS.SETTINGS.VIEW,
      PERMISSIONS.SETTINGS.MANAGE_CATEGORIES,
    ],
    limits: {
      maxDiscount: 25,
      maxRefundAmount: 10000,
    },
    isSystem: true,
  },

  CASHIER: {
    id: 'cashier',
    name: 'Sales Person / Cashier',
    description: 'Handle sales and customer service',
    permissions: [
      PERMISSIONS.POS.ACCESS,
      PERMISSIONS.POS.APPLY_DISCOUNT,
      PERMISSIONS.POS.VIEW_DAILY_SALES,
      PERMISSIONS.INVENTORY.VIEW,
      PERMISSIONS.ORDERS.VIEW,
      PERMISSIONS.ORDERS.CREATE,
      PERMISSIONS.ORDERS.UPDATE_STATUS,
    ],
    limits: {
      maxDiscount: 10,
      maxTransactionAmount: 5000,
      requireManagerApproval: {
        discount: 10,
        void: true,
        refund: true,
        priceOverride: true,
      },
    },
    isSystem: true,
  },

  WAREHOUSE: {
    id: 'warehouse',
    name: 'Warehouse Staff',
    description: 'Manage inventory and fulfill orders',
    permissions: [
      PERMISSIONS.INVENTORY.VIEW,
      PERMISSIONS.INVENTORY.UPDATE,
      PERMISSIONS.INVENTORY.ADJUST_STOCK,
      PERMISSIONS.ORDERS.VIEW,
      PERMISSIONS.ORDERS.UPDATE_STATUS,
    ],
    isSystem: true,
  },

  DRIVER: {
    id: 'driver',
    name: 'Delivery Driver',
    description: 'Deliver orders to customers',
    permissions: [
      PERMISSIONS.ORDERS.VIEW,
      PERMISSIONS.ORDERS.UPDATE_STATUS,
    ],
    isSystem: true,
  },

  VIEWER: {
    id: 'viewer',
    name: 'View Only / Accountant',
    description: 'View-only access to reports and POS',
    permissions: [
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.INVENTORY.VIEW,
      PERMISSIONS.POS.ACCESS,
      PERMISSIONS.ORDERS.VIEW_ALL,
      PERMISSIONS.REPORTS.VIEW_SALES,
      PERMISSIONS.REPORTS.VIEW_INVENTORY,
      PERMISSIONS.REPORTS.VIEW_PROFIT,
      PERMISSIONS.REPORTS.VIEW_ACTIVITY_LOG,
      PERMISSIONS.REPORTS.EXPORT,
    ],
    isSystem: true,
  },
};
