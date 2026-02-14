/**
 * API status (circuit breaker) for the app. Single source of truth for "server unavailable".
 * Use to show banner (Layout) and disable destructive actions when degraded.
 * Do not use for routing or env detection — only for resilience UX.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getApiCircuitBreaker } from '../lib/circuit';

const POLL_INTERVAL_MS = 2000;

type ApiStatusContextValue = {
  /** True when circuit breaker is open (server considered unavailable). */
  isDegraded: boolean;
  /** Call after user clicks "Try again" to reset circuit and allow one request. */
  retry: () => void;
};

const ApiStatusContext = createContext<ApiStatusContextValue | undefined>(undefined);

export function ApiStatusProvider({ children }: { children: ReactNode }) {
  const [isDegraded, setIsDegraded] = useState(false);

  useEffect(() => {
    const circuit = getApiCircuitBreaker();
    const check = () => setIsDegraded(circuit.isDegraded());
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const retry = useCallback(() => {
    const circuit = getApiCircuitBreaker();
    circuit.reset();
    setIsDegraded(false);
    window.dispatchEvent(new CustomEvent('circuit-retry'));
  }, []);

  return (
    <ApiStatusContext.Provider value={{ isDegraded, retry }}>
      {children}
    </ApiStatusContext.Provider>
  );
}

export function useApiStatus(): ApiStatusContextValue {
  const ctx = useContext(ApiStatusContext);
  if (ctx === undefined) {
    throw new Error('useApiStatus must be used within ApiStatusProvider');
  }
  return ctx;
}
