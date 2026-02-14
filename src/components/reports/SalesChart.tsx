import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { SalesReport } from '../../services/reportService';
import { formatCurrency } from '../../lib/utils';

interface SalesChartProps {
  report: SalesReport;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function SalesChart({ report }: SalesChartProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Daily Sales */}
      <div className="solid-card animate-fade-in-up">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">Daily Sales</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={report.salesByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '12px' }} />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid rgba(226, 232, 240, 0.9)',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                padding: '12px',
              }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend />
            <Bar dataKey="revenue" fill="#3b82f6" name="Revenue (₵)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Distribution */}
      <div className="solid-card animate-fade-in-up">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">Sales by Category</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={report.salesByCategory}
              dataKey="revenue"
              nameKey="category"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ category, revenue }: { category: string; revenue: number }) => `${category}: ${formatCurrency(revenue)}`}
            >
              {report.salesByCategory.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
