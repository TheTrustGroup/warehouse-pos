import { Plus, ShoppingCart, FileBarChart, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function QuickActions() {
  const navigate = useNavigate();

  const actions = [
    {
      name: 'New Product',
      icon: Plus,
      color: 'bg-blue-500 hover:bg-blue-600',
      onClick: () => navigate('/inventory?action=add'),
    },
    {
      name: 'New Sale',
      icon: ShoppingCart,
      color: 'bg-green-500 hover:bg-green-600',
      onClick: () => navigate('/pos'),
    },
    {
      name: 'Generate Report',
      icon: FileBarChart,
      color: 'bg-purple-500 hover:bg-purple-600',
      onClick: () => navigate('/reports'),
    },
    {
      name: 'View Inventory',
      icon: Package,
      color: 'bg-amber-500 hover:bg-amber-600',
      onClick: () => navigate('/inventory'),
    },
  ];

  return (
    <div className="solid-card animate-fade-in-up">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action.name}
            onClick={action.onClick}
            className={`${action.color} text-white p-5 rounded-xl transition-all duration-200 flex flex-col items-center gap-2.5 hover:scale-105 hover:shadow-lg active:scale-95`}
          >
            <action.icon className="w-6 h-6" />
            <span className="text-sm font-semibold">{action.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
