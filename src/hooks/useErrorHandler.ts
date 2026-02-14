/**
 * Hook for consistent error handling: report, log in dev, and show user-friendly toast.
 * Use in catch blocks so users see a clear message and errors are tracked.
 */

import { useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { reportError } from '../lib/errorReporting';
import { getUserFriendlyMessage } from '../lib/errorMessages';

export interface UseErrorHandlerOptions {
  /** Override the message shown in the toast (default: getUserFriendlyMessage(error)) */
  message?: string;
  /** Extra context for error reporting (e.g. { action: 'saveProduct' }) */
  context?: Record<string, unknown>;
  /** If true, do not show a toast (e.g. when you show an inline error or retry UI instead) */
  silent?: boolean;
}

/**
 * Returns a handler that reports the error, logs in development, and shows an error toast
 * with a user-friendly message. Use for async operations:
 *
 * try {
 *   await saveProduct(data);
 *   showToast('success', 'Saved');
 * } catch (e) {
 *   handleError(e, { context: { action: 'saveProduct' } });
 * }
 */
export function useErrorHandler() {
  const { showToast } = useToast();

  const handleError = useCallback(
    (error: unknown, options: UseErrorHandlerOptions = {}) => {
      const { message: overrideMessage, context, silent = false } = options;
      reportError(error, context);
      if (!silent) {
        const message = overrideMessage ?? getUserFriendlyMessage(error);
        showToast('error', message);
      }
    },
    [showToast]
  );

  return handleError;
}
