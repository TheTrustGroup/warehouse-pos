/**
 * Production-only diagnostic logging. Safe, removable, no secrets.
 * Gate: runs only in production build (Vite PROD).
 * Sends to debug ingest and logs structured data to console.
 */
const PROD_DEBUG = typeof import.meta !== 'undefined' && !!import.meta.env?.PROD;

const INGEST_URL = 'http://127.0.0.1:7242/ingest/89e700ea-c11b-47a3-9c36-45e875a36239';

export function prodDebug(payload: {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
  runId?: string;
}): void {
  // #region agent log
  if (!PROD_DEBUG) return;
  const ts = Date.now();
  const body = {
    timestamp: ts,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    hypothesisId: payload.hypothesisId,
    runId: payload.runId,
  };
  try {
    if (typeof console !== 'undefined' && console.info) {
      console.info('[ProdDebug]', payload.message, payload.data ?? '');
    }
    // Only send to local ingest when not on HTTPS (avoids mixed-content errors and blocked fetches in production)
    const canUseIngest = typeof window !== 'undefined' && typeof window.location?.origin === 'string' && !window.location.origin.startsWith('https://');
    if (canUseIngest && typeof fetch !== 'undefined') {
      fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {});
    }
  } catch {
    // no-op
  }
  // #endregion
}
