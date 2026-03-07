import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { Button } from './Button';
interface ToastActionProp {
  label: string;
  onAction: () => void;
}

interface ToastProps {
  type: 'success' | 'error' | 'warning';
  message: string;
  onClose: () => void;
  duration?: number;
  action?: ToastActionProp;
}

export function Toast({ type, message, onClose, duration = 3000, action }: ToastProps) {
  const autoDismissMs = action ? 0 : duration;

  useEffect(() => {
    if (autoDismissMs <= 0) return;
    const timer = setTimeout(onClose, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onClose]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
  };

  const colors = {
    success: 'bg-[var(--edk-green-bg)] border-2 border-[var(--edk-green)]/20 text-[var(--edk-ink)]',
    error: 'bg-[var(--edk-red-soft)] border-2 border-[var(--edk-red-border)] text-[var(--edk-ink)]',
    warning: 'bg-[var(--edk-amber-bg)] border-2 border-[var(--edk-amber)]/30 text-[var(--edk-ink)]',
  };

  const Icon = icons[type];

  const handleAction = () => {
    action?.onAction();
    onClose();
  };

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 px-4 py-3 min-h-[var(--touch-min)] rounded-[var(--edk-radius)] ${colors[type]} shadow-[0_4px_16px_rgba(0,0,0,0.08)]`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} aria-hidden />
      <p className="font-medium flex-1 text-sm">{message}</p>
      {action && (
        <Button
          type="button"
          variant="primary"
          onClick={handleAction}
          className="flex-shrink-0 min-h-touch"
          aria-label={action.label}
        >
          {action.label}
        </Button>
      )}
      <Button type="button" variant="action" onClick={onClose} className="flex-shrink-0" aria-label="Dismiss">
        <X className="w-4 h-4" strokeWidth={2} />
      </Button>
    </div>
  );
}
