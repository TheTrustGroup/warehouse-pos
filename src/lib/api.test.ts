/**
 * API module tests. Ensures single source of truth: API_BASE_URL from env, getApiHeaders shape.
 */
import { describe, it, expect } from 'vitest';
import { API_BASE_URL, getApiHeaders } from './api';

describe('api', () => {
  describe('API_BASE_URL', () => {
    it('is a non-empty string', () => {
      expect(typeof API_BASE_URL).toBe('string');
      expect(API_BASE_URL.length).toBeGreaterThan(0);
    });

    it('is a full URL (http or https)', () => {
      expect(API_BASE_URL).toMatch(/^https?:\/\//);
    });
  });

  describe('getApiHeaders', () => {
    it('returns Content-Type and Accept for JSON', () => {
      const headers = getApiHeaders() as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
    });
  });
});
