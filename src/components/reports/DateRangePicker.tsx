import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  presets?: Array<{ label: string; days: number }>;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  presets = [
    { label: 'Today', days: 0 },
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'Last 90 Days', days: 90 },
  ],
}: DateRangePickerProps) {
  const handlePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days > 0) {
      start.setDate(start.getDate() - days);
    }
    
    onEndDateChange(end.toISOString().split('T')[0]);
    onStartDateChange(start.toISOString().split('T')[0]);
  };

  return (
    <div className="glass-card animate-fade-in-up">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="w-5 h-5 text-primary-600" strokeWidth={2} />
        <h3 className="font-semibold text-slate-900">Date Range</h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => onStartDateChange(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={e => onEndDateChange(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map(preset => (
          <button
            key={preset.label}
            onClick={() => handlePreset(preset.days)}
            className="px-4 py-2 text-sm font-semibold bg-slate-100/80 hover:bg-slate-200/80 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
