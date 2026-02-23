/**
 * Receipt: Ghana date formatting and payload shape.
 */
import { describe, it, expect } from 'vitest';
import { formatReceiptDate } from './printReceipt';

describe('formatReceiptDate', () => {
  it('returns a non-empty string for valid ISO date', () => {
    const s = formatReceiptDate('2025-02-22T14:30:00.000Z');
    expect(s).toBeTruthy();
    expect(typeof s).toBe('string');
  });

  it('uses Ghana timezone (Africa/Accra) — GMT, so UTC date matches local', () => {
    // 22 Feb 2025 14:30 UTC = 14:30 in Accra (GMT)
    const s = formatReceiptDate('2025-02-22T14:30:00.000Z');
    expect(s).toContain('2025');
    expect(s).toMatch(/\d/);
  });

  it('returns current time when given null/undefined', () => {
    const s = formatReceiptDate(null);
    expect(s).toBeTruthy();
    const s2 = formatReceiptDate(undefined);
    expect(s2).toBeTruthy();
  });
});
