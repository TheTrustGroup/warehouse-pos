import { lazy, LazyExoticComponent, ComponentType } from 'react';

/**
 * Lazy-load a component with retries. Avoids "Something went wrong" on first paint after login
 * when the route chunk fails to load (e.g. transient network or cache miss).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  delayMs = 400
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importFn();
      } catch (e) {
        lastErr = e;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastErr;
  });
}
