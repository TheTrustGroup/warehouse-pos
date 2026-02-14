/**
 * Circuit breaker and failure tracking for API resilience.
 * After consecutive failures, "opens" and blocks calls until cooldown.
 */

const DEFAULT_FAILURE_THRESHOLD = 5;
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

let sharedCircuit: CircuitBreaker | null = null;

export function getApiCircuitBreaker(): CircuitBreaker {
  if (!sharedCircuit) {
    sharedCircuit = new CircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 30_000,
    });
  }
  return sharedCircuit;
}
