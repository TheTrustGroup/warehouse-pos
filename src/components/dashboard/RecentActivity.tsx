import { InventoryActivity } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { Package, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface RecentActivityProps {
  activities: InventoryActivity[];
}

const actionIcons = {
  sale: TrendingDown,
  add: TrendingUp,
  update: RefreshCw,
  return: TrendingUp,
  adjustment: RefreshCw,
  transfer: Package,
};

const actionColors = {
  sale: 'text-red-600 bg-red-50',
  add: 'text-green-600 bg-green-50',
  update: 'text-blue-600 bg-blue-50',
  return: 'text-green-600 bg-green-50',
  adjustment: 'text-amber-600 bg-amber-50',
  transfer: 'text-purple-600 bg-purple-50',
};

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <div className="glass-card animate-fade-in-up">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = actionIcons[activity.action];
          const colorClass = actionColors[activity.action];
          
          return (
            <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50/50 transition-colors duration-150">
              <div className={`p-2.5 rounded-lg ${colorClass} backdrop-blur-[10px] border border-current/20 flex-shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 mb-1">
                  {activity.productName}
                </p>
                <p className="text-xs text-slate-600 mb-1.5">
                  {activity.action === 'sale' && `Sold ${Math.abs(activity.quantityChanged)} units`}
                  {activity.action === 'add' && `Added ${activity.quantityChanged} units`}
                  {activity.action === 'update' && `Adjusted by ${activity.quantityChanged} units`}
                  {activity.action === 'return' && `Returned ${activity.quantityChanged} units`}
                  {activity.action === 'adjustment' && `Stock adjusted: ${activity.quantityChanged}`}
                  {activity.action === 'transfer' && `Transferred ${Math.abs(activity.quantityChanged)} units`}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(activity.timestamp)} • {activity.performedBy}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <p className="text-sm font-bold text-slate-900">
                  {activity.quantityAfter}
                </p>
                <p className="text-xs text-slate-500">in stock</p>
              </div>
            </div>
          );
        })}
      </div>
      <button className="w-full mt-6 py-3 text-sm font-semibold text-primary-600 hover:bg-primary-50/80 rounded-lg transition-all duration-200 hover:shadow-sm border border-primary-200/30">
        View All Activity
      </button>
    </div>
  );
}
