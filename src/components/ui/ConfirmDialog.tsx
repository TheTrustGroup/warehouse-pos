import { ReactNode } from 'react';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  /** When true, confirm button shows loading and is disabled. */
  isConfirming?: boolean;
  /** Optional custom icon (e.g. Trash2 for delete). */
  icon?: ReactNode;
}

/**
 * Accessible confirmation dialog. Use instead of confirm() for consistent UI and a11y.
 * Trap focus when open; Escape and Cancel close without confirming.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isConfirming = false,
  icon,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isConfirming) return;
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 solid-overlay flex items-center justify-center z-[var(--z-modal,50)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={onClose}
    >
      <div
        className="solid-panel rounded-2xl shadow-xl max-w-md w-full p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
            {icon ?? <AlertTriangle className="w-6 h-6" aria-hidden />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900 mb-1">
              {title}
            </h2>
            <p id="confirm-dialog-desc" className="text-slate-600 text-sm">
              {message}
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={isConfirming}
            aria-busy={isConfirming}
            className="inline-flex items-center justify-center gap-2"
          >
            {isConfirming ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                Confirming…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
