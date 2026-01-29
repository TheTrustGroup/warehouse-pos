import { memo } from 'react';
import { LucideIcon } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  format?: 'number' | 'currency' | 'text';
  color?: 'blue' | 'green' | 'amber' | 'red';
}

const colorClasses = {
  blue: 'bg-blue-50/80 text-blue-600 border-blue-200/30',
  green: 'bg-emerald-50/80 text-emerald-600 border-emerald-200/30',
  amber: 'bg-amber-50/80 text-amber-600 border-amber-200/30',
  red: 'bg-red-50/80 text-red-600 border-red-200/30',
};

export const StatCard = memo(function StatCard({ title, value, icon: Icon, trend, format = 'number', color = 'blue' }: StatCardProps) {
  const num = value != null ? Number(value) : 0;
  const safeNum = typeof num === 'number' && Number.isFinite(num) ? num : 0;
  const formattedValue = format === 'currency'
    ? formatCurrency(safeNum)
    : format === 'number'
    ? safeNum.toLocaleString()
    : typeof value === 'string' || typeof value === 'number' ? value : String(value ?? '');

  return (
    <div className="glass-card animate-fade-in-up p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-600 mb-3">{title}</p>
          <p 
            className={`font-bold text-slate-900 tracking-tight leading-none mb-3 ${
              format === 'currency' 
                ? 'text-2xl' 
                : 'text-3xl'
            }`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {formattedValue}
          </p>
          {trend && (
            <div className={`text-xs font-semibold flex items-center gap-1.5 ${trend.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              <span className="text-base">{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value).toFixed(1)}% vs last period</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl border backdrop-blur-[10px] ${colorClasses[color]} flex-shrink-0`}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
});
