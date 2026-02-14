import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  Users,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PERMISSIONS, ROLES } from '../../types/permissions';
import { Button } from '../ui/Button';

const baseNavigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD.VIEW },
  { name: 'Inventory', to: '/inventory', icon: Package, permission: PERMISSIONS.INVENTORY.VIEW },
  { name: 'Orders', to: '/orders', icon: ClipboardList, permission: PERMISSIONS.ORDERS.VIEW },
  { name: 'POS', to: '/pos', icon: ShoppingCart, permission: PERMISSIONS.POS.ACCESS },
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

function getRoleDisplayName(roleId: string | undefined): string {
  if (roleId == null || roleId === '') return '—';
  const key = roleId === 'super_admin' ? 'SUPER_ADMIN' : roleId.toUpperCase().replace(/\s+/g, '_');
  return ROLES[key]?.name ?? roleId;
}

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, hasPermission, hasAnyPermission, switchRole } = useAuth();
  // Hardening: only admins see "Switch role" (testing). Others cannot try to switch; backend enforces 403.
  const canSeeSwitchRole = user?.role === 'admin' || user?.role === 'super_admin';

  const navigation = baseNavigation.filter(
    (item) =>
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  useEffect(() => {
    if (isOpen) document.body.classList.add('scroll-lock');
    else document.body.classList.remove('scroll-lock');
    return () => document.body.classList.remove('scroll-lock');
  }, [isOpen]);

  return (
    <>
      {/* Toggle: 44px touch target, thumb-friendly on mobile */}
      <Button
        variant="action"
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-[88px] left-4 z-40 min-h-touch min-w-touch flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-md"
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
      </Button>

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute inset-0 solid-overlay" onClick={() => setIsOpen(false)} aria-hidden></div>
        <aside className="relative w-[280px] min-w-[280px] max-w-[85vw] h-full min-h-[var(--h-viewport)] flex flex-col solid-panel shadow-xl border-r border-slate-200/80 flex-shrink-0">
          <div className="px-5 py-5 border-b border-slate-200/30 flex-shrink-0">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-bold leading-tight tracking-tight gradient-text">
                Extreme Dept Kidz
              </h1>
              <p className="text-xs font-medium text-slate-500">Inventory & POS</p>
            </div>
          </div>

          <nav className="px-3 py-6 space-y-1 flex-1 min-h-0 overflow-y-auto">
            {navigation.map(item => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'nav-item-active' : ''}`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
                <span className="text-sm">{item.name}</span>
              </NavLink>
            ))}
          </nav>
          <div className="p-4 border-t border-slate-200/30 space-y-3 flex-shrink-0 min-h-[5rem]">
            {user && (
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-600">Role: </span>
                {getRoleDisplayName(user?.role)}
              </p>
            )}
            {canSeeSwitchRole && user && (
              <label className="block">
                <span className="text-xs font-medium text-slate-500 block mb-1">Switch role (testing)</span>
                <select
                  value={user.role}
                  onChange={(e) => { switchRole(e.target.value); setIsOpen(false); }}
                  className="input-field w-full text-sm font-medium text-slate-900"
                  aria-label="Switch role"
                >
                  {Object.values(ROLES).map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
