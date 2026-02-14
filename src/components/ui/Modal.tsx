/**
 * Single source of truth for modal overlay. Handles backdrop, close on Escape/backdrop, scroll lock, and aria.
 * Slide-up + backdrop fade with spring physics when animations enabled.
 */
import { ReactNode, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimations } from '../../hooks/useAnimations';
import { modalOverlayVariants, modalContentVariants } from '../../animations/liquidGlass';

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
  const { reduced } = useAnimations();
  const overlayVariants = modalOverlayVariants(reduced);
  const contentVariants = modalContentVariants(reduced);

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

  const overlay = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="modal-overlay"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={overlayVariants}
          className={`fixed inset-0 glass-overlay flex items-center justify-center z-[var(--z-modal,50)] ${overlayClassName}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={onClose}
        >
          <motion.div
            key="modal-content"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full max-h-[90vh] overflow-y-auto flex items-center justify-center p-2 sm:p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : null;
}
