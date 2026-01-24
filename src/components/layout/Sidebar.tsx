// src/components/layout/Sidebar.tsx - Premium Figma-Inspired Design
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  Users,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Inventory', to: '/inventory', icon: Package },
  { name: 'POS', to: '/pos', icon: ShoppingCart },
  { name: 'Reports', to: '/reports', icon: BarChart3 },
  { name: 'Users', to: '/users', icon: Users },
  { name: 'Settings', to: '/settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-[280px] bg-glass border-r border-white/40 flex flex-col shadow-glass backdrop-blur-xl">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-200/30">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold leading-none tracking-tight gradient-text">
            Extreme Dept Kidz
          </h1>
          <p className="text-[13px] font-medium text-slate-500 pl-0.5">
            Inventory & POS
          </p>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : ''}`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            <span className="text-sm">{item.name}</span>
          </NavLink>
        ))}
      </nav>
      
      {/* User Profile */}
      <div className="p-4 border-t border-slate-200/30">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-slate-50/80 transition-all cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:shadow-xl transition-shadow">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">John Doe</p>
            <p className="text-xs text-slate-500 font-medium">Admin</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-500/50"></div>
        </div>
      </div>
    </aside>
  );
}
