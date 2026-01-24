import { useState } from 'react';
import { Menu, X } from 'lucide-react';
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

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-[88px] left-4 z-40 p-2.5 glass rounded-lg shadow-medium hover:shadow-large transition-all duration-200"
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
      </button>

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)}></div>
        <aside className="relative w-[280px] h-full glass shadow-large border-r border-slate-200/50">
          <div className="px-6 py-6 border-b border-slate-200/30">
            <div className="flex flex-col gap-1">
              <h1 className="text-[28px] font-extrabold leading-none tracking-tight gradient-text">
                Extreme Dept Kidz
              </h1>
              <p className="text-[13px] font-medium text-slate-500 pl-0.5">Inventory & POS</p>
            </div>
          </div>

          <nav className="px-3 py-6 space-y-1">
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
        </aside>
      </div>
    </>
  );
}
