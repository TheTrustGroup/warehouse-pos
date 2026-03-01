/**
 * Single source of truth for app navigation. Import in both Sidebar and MobileMenu
 * so desktop and mobile never drift (see ENGINEERING_RULES §8).
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
  Receipt,
  Truck,
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '../types/permissions';

export interface NavItem {
  name: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  anyPermissions?: Permission[];
}

export const baseNavigation: NavItem[] = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD.VIEW },
  { name: 'Inventory', to: '/inventory', icon: Package, permission: PERMISSIONS.INVENTORY.VIEW },
  { name: 'Orders', to: '/orders', icon: ClipboardList, permission: PERMISSIONS.ORDERS.VIEW },
  { name: 'POS', to: '/pos', icon: ShoppingCart, permission: PERMISSIONS.POS.ACCESS },
  { name: 'Sales', to: '/sales', icon: Receipt, permission: PERMISSIONS.REPORTS.VIEW_SALES },
  { name: 'Deliveries', to: '/deliveries', icon: Truck, permission: PERMISSIONS.DELIVERIES.VIEW },
  {
    name: 'Reports',
    to: '/reports',
    icon: BarChart3,
    anyPermissions: [
      PERMISSIONS.REPORTS.VIEW_SALES,
      PERMISSIONS.REPORTS.VIEW_INVENTORY,
      PERMISSIONS.REPORTS.VIEW_PROFIT,
    ],
  },
  { name: 'Users', to: '/users', icon: Users, permission: PERMISSIONS.USERS.VIEW },
  { name: 'Settings', to: '/settings', icon: Settings, permission: PERMISSIONS.SETTINGS.VIEW },
];
