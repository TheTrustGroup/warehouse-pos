/**
 * User-friendly error messages and error classification.
 * Use for toasts and error boundaries so users see clear, actionable text instead of raw errors.
 */

/**
 * Map known error patterns to short, user-friendly messages.
 * Add new mappings here as you discover recurring errors.
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error == null) return 'Something went wrong. Please try again.';

  const msg = error instanceof Error ? error.message : String(error);
  const str = msg.toLowerCase();

  // Network / connectivity
  if (str.includes('failed to fetch') || str.includes('network error') || str.includes('load failed')) {
    return 'Connection problem. Check your network and try again.';
  }
  if (str.includes('timeout') || str.includes('timed out')) {
    return 'Request took too long. Check your connection and try again.';
  }
  if (str.includes('server is temporarily unavailable') || str.includes('circuit')) {
    return 'Server is temporarily unavailable. Using last saved data. Try again in a moment.';
  }

  // HTTP status
  if (str.includes('401') || str.includes('unauthorized')) {
    return 'Session expired. Please sign in again.';
  }
  if (str.includes('403') || str.includes('forbidden')) {
    return "You don't have permission to do that.";
  }
  if (str.includes('404') || str.includes('not found')) {
    return 'The requested item was not found.';
  }
  if (str.includes('409') || str.includes('conflict')) {
    return 'This was changed elsewhere. Please refresh and try again.';
  }
  if (str.includes('422') || str.includes('validation')) {
    return 'Invalid data. Please check your input and try again.';
  }
  if (str.includes('429') || str.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (str.includes('500') || str.includes('502') || str.includes('503') || str.includes('504')) {
    return 'Server error. Please try again in a moment.';
  }

  // Abort (user navigated away or cancelled)
  if (str.includes('abort')) {
    return 'Request was cancelled.';
  }

  // Storage
  if (str.includes('quota') || str.includes('storage')) {
    return 'Storage is full. Free some space or clear old data and try again.';
  }

  // Auth
  if (str.includes('invalid credentials') || str.includes('wrong password')) {
    return 'Invalid email or password. Please try again.';
  }
  if (str.includes('login') && (str.includes('fail') || str.includes('error'))) {
    return 'Login failed. Check your details and try again.';
  }

  // Product / inventory
  if (str.includes('saved locally') || str.includes('add_product_saved_locally')) {
    return 'Product was saved on this device. Sync when online to save to server.';
  }
  if (str.includes('delete') && str.includes('fail')) {
    return 'Could not delete. Try again or refresh the list.';
  }
  if (str.includes('sync') && str.includes('fail')) {
    return 'Sync failed. You can try again when the connection is stable.';
  }

  // Generic but safe: use message if it looks user-facing (short, no stack), else fallback
  if (error instanceof Error && msg.length <= 120 && !msg.includes(' at ') && !msg.includes('.ts')) {
    return msg;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Whether the error is typically retryable (network, timeout, 5xx).
 */
export function isRetryableError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes('abort') || msg.includes('cancel')) return false;
  if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('422')) return false;
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) return true;
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  if (msg.includes('429') || msg.includes('temporarily unavailable')) return true;
  return false;
}
