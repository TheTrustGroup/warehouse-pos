import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  type: 'success' | 'error' | 'warning';
  message: string;
  onClose: () => void;
  duration?: number;
}

export function Toast({ type, message, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
  };

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
  };

  const Icon = icons[type];

  return (
    <div className={`glass-card flex items-center gap-3 px-4 py-3 border-2 shadow-glass-hover ${colors[type]} animate-slide-in-right backdrop-blur-xl`}>
      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
      <p className="font-semibold flex-1">{message}</p>
      <button onClick={onClose} className="btn-action ml-2 hover:opacity-70">
        <X className="w-4 h-4" strokeWidth={2} />
      </button>
    </div>
  );
}
