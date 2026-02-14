/**
 * Service worker registration: register, unregister, update handling, background sync, periodic sync.
 * Use register() from main.tsx and optionally listen for 'sw-update' to show refresh toast.
 */

import { syncService } from './services/syncService';
import { reportError } from './lib/errorReporting';
import { isOfflineEnabled } from './lib/offlineFeatureFlag';

const SW_URL = '/service-worker.js';

/**
 * Register the service worker and set up update handling.
 * @param {{
 *   onUpdate?: () => void;
 *   onSuccess?: (registration: ServiceWorkerRegistration) => void;
 * }} [config] - onUpdate called when a new SW has activated (show "Refresh" toast); onSuccess called when registration succeeds.
 * @returns {Promise<ServiceWorkerRegistration | null>}
 */
export function register(config = {}) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  const doRegister = () =>
    navigator.serviceWorker
      .register(SW_URL)
      .then((registration) => {
        let pendingUpdate = false;

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && registration.waiting) {
              pendingUpdate = true;
            }
          });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (pendingUpdate && config.onUpdate) {
            config.onUpdate();
            pendingUpdate = false;
          }
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SW_UPDATED' && config.onUpdate) {
            config.onUpdate();
          }
          if (event.data?.type === 'SYNC_INVENTORY' && isOfflineEnabled()) {
            syncService.processSyncQueue().catch(() => {});
          }
          if (event.data?.type === 'SW_ERROR') {
            const err = event.data?.error
              ? new Error(event.data.error.message || String(event.data.error))
              : new Error('Service worker error');
            reportError(err, { source: 'service-worker', raw: event.data?.error });
          }
        });

        const registerSync = () => {
          if (registration.sync) {
            registration.sync.register('sync-inventory').catch(() => {});
          }
        };
        if (navigator.onLine) registerSync();
        window.addEventListener('online', registerSync);

        if (registration.periodicSync) {
          try {
            registration.periodicSync
              .register('inventory-periodic', { minInterval: 12 * 60 * 60 })
              .catch(() => {});
          } catch {
            // not supported
          }
        }

        config.onSuccess?.(registration);
        return registration;
      })
      .catch((err) => {
        if (import.meta.env?.DEV) {
          console.warn('Service worker registration failed:', err);
        }
        return null;
      });

  if (document.readyState === 'complete') {
    return doRegister();
  }
  return new Promise((resolve) => {
    window.addEventListener('load', () => doRegister().then(resolve));
  });
}

/**
 * Unregister the service worker.
 * @returns {Promise<boolean>}
 */
export function unregister() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }
  return navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch(() => false);
}
