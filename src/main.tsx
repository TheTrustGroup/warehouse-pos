import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { initObservability, startHealthPings } from './lib/observability';

initObservability({
  healthUrl: import.meta.env.VITE_HEALTH_URL || undefined,
  reportError:
    import.meta.env.VITE_SENTRY_DSN && typeof window !== 'undefined'
      ? (err, ctx) => {
          console.error('[Report]', err, ctx);
          // window.Sentry?.captureException?.(err, { extra: ctx });
        }
      : undefined,
});
if (import.meta.env.VITE_HEALTH_URL) startHealthPings();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Register service worker for PWA (app shell + static assets)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, but app still works
    });
  });
}
