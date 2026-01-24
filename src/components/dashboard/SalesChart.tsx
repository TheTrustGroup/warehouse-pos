import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface SalesChartProps {
  data: Array<{
    date: string;
    sales: number;
    revenue: number;
  }>;
}

export function SalesChart({ data }: SalesChartProps) {
  return (
    <div className="glass-card animate-fade-in-up">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Sales Trend (Last 7 Days)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(226, 232, 240, 0.5)" />
          <XAxis 
            dataKey="date" 
            stroke="#94a3b8"
            style={{ fontSize: '12px', fontWeight: '500' }}
            tick={{ fill: '#64748b' }}
          />
          <YAxis 
            stroke="#94a3b8"
            style={{ fontSize: '12px', fontWeight: '500' }}
            tick={{ fill: '#64748b' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(226, 232, 240, 0.5)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
              padding: '12px',
            }}
            labelStyle={{ fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '16px' }}
            iconType="line"
          />
          <Line 
            type="monotone" 
            dataKey="revenue" 
            stroke="#ef4444" 
            strokeWidth={2.5}
            dot={{ fill: '#ef4444', r: 5, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 7 }}
            name="Revenue ($)"
          />
          <Line 
            type="monotone" 
            dataKey="sales" 
            stroke="#10b981" 
            strokeWidth={2.5}
            dot={{ fill: '#10b981', r: 5, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 7 }}
            name="Transactions"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
