/**
 * Circuit breaker and failure tracking for API resilience.
 * After consecutive failures, "opens" and blocks calls until cooldown.
 */

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

type State = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  onStateChange?: (state: State) => void;
}

export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly onStateChange?: (state: State) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.onStateChange = options.onStateChange;
  }

  getState(): State {
    if (this.state !== 'open') return this.state;
    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed >= this.cooldownMs) {
      this.state = 'half-open';
      this.onStateChange?.(this.state);
    }
    return this.state;
  }

  recordSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.onStateChange?.(this.state);
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === 'half-open') {
      this.state = 'open';
      this.onStateChange?.(this.state);
      return;
    }
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.onStateChange?.(this.state);
    }
  }

  /** Returns true if a request is allowed. */
  allowRequest(): boolean {
    return this.getState() !== 'open';
  }

  isDegraded(): boolean {
    return this.getState() === 'open';
  }

  /** Reset to closed so the user can try again without waiting for cooldown. */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.onStateChange?.(this.state);
  }
}

const circuits = new Map<string, CircuitBreaker>();

function logCircuitState(state: State): void {
  if (state === 'open' && typeof console !== 'undefined') {
    console.warn(
      '[API] Circuit breaker opened — server temporarily unavailable. Requests will be blocked until cooldown. Check backend and network.'
    );
  }
}

function createCircuit(): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: DEFAULT_FAILURE_THRESHOLD,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    onStateChange: logCircuitState,
  });
}

/**
 * Get circuit breaker for a given endpoint name. Each name has its own instance
 * so e.g. products timeouts do not block stores/warehouses.
 */
export function getApiCircuitBreaker(name: string = 'default'): CircuitBreaker {
  if (!circuits.has(name)) {
    circuits.set(name, createCircuit());
  }
  return circuits.get(name)!;
}

/** Reset one circuit by name (for tests). Next getApiCircuitBreaker(name) will create a fresh instance. */
export function resetApiCircuitBreaker(name: string = 'default'): void {
  circuits.delete(name);
}

/** Reset state of all circuits so the app Retry button allows requests again. */
export function resetAllApiCircuitBreakers(): void {
  circuits.forEach((c) => c.reset());
}

/** True if any circuit is open (for app-wide "Server unavailable" banner). */
export function isAnyApiCircuitDegraded(): boolean {
  for (const c of circuits.values()) {
    if (c.isDegraded()) return true;
  }
  return false;
}
