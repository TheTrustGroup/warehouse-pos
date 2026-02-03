import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from './circuit';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 100 });
  });

  it('starts closed and allows requests', () => {
    expect(cb.allowRequest()).toBe(true);
    expect(cb.isDegraded()).toBe(false);
  });

  it('opens after failureThreshold failures', () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.allowRequest()).toBe(true);
    cb.recordFailure();
    expect(cb.allowRequest()).toBe(false);
    expect(cb.isDegraded()).toBe(true);
  });

  it('resets failures on success', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.allowRequest()).toBe(true);
    cb.recordFailure();
    expect(cb.allowRequest()).toBe(false);
  });

  it('recovers after cooldown (half-open then closed on success)', async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.allowRequest()).toBe(false);
    await new Promise((r) => setTimeout(r, 110));
    expect(cb.allowRequest()).toBe(true);
    cb.recordSuccess();
    expect(cb.allowRequest()).toBe(true);
    expect(cb.isDegraded()).toBe(false);
  });
});
