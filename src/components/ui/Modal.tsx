/**
 * Single source of truth for modal overlay. Handles backdrop, close on Escape/backdrop, scroll lock, and aria.
 * Use for any dialog (e.g. ProductFormModal, Receipt) so behavior and a11y are consistent.
 */
import { ReactNode, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional title for aria-labelledby. */
  titleId?: string;
  /** Modal content (e.g. Card or custom layout). */
  children: ReactNode;
  /** Extra class for the overlay div (e.g. modal-overlay-padding). */
  overlayClassName?: string;
}

export function Modal({ isOpen, onClose, titleId, children, overlayClassName = '' }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('scroll-lock');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('scroll-lock');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const overlay = (
    <div
      className={`fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[var(--z-modal,50)] ${overlayClassName}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div className="w-full max-h-[90vh] overflow-y-auto flex items-center justify-center p-2 sm:p-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}
