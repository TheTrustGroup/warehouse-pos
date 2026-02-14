import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { Button } from './Button';

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
    <div
      role="alert"
      className={`glass-card flex items-center gap-3 px-4 py-3 min-h-touch border-2 ${colors[type]} shadow-large`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} aria-hidden />
      <p className="font-medium flex-1 text-sm">{message}</p>
      <Button type="button" variant="action" onClick={onClose} className="flex-shrink-0" aria-label="Dismiss">
        <X className="w-4 h-4" strokeWidth={2} />
      </Button>
    </div>
  );
}
