/**
 * Global error handlers: unhandledrejection, window.onerror.
 * Reports to reportError (logger + optional Sentry when consent given).
 * Call once from main.tsx.
 */

import { reportError } from './errorReporting';

const CONSENT_KEY = 'error_reporting_consent';

export function getErrorReportingConsent(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setErrorReportingConsent(consent: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONSENT_KEY, consent ? 'true' : 'false');
    }
  } catch (_) {}
}

export function initErrorHandlers(): void {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    reportError(err, { source: 'unhandledrejection' });
  });

  window.addEventListener('error', (event) => {
    const err = event.error instanceof Error ? event.error : new Error(event.message);
    reportError(err, {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
}
