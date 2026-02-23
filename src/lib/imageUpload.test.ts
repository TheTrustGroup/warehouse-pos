/**
 * imageUpload: safeProductImageUrl and isBase64.
 * safeProductImageUrl allows data: and same-origin Supabase Storage URLs only (env-dependent); tests cover data: and rejection of arbitrary URLs.
 */
import { describe, it, expect } from 'vitest';
import { safeProductImageUrl, isBase64, EMPTY_IMAGE_DATA_URL } from './imageUpload';

describe('isBase64', () => {
  it('returns true for data: URLs', () => {
    expect(isBase64('data:image/png;base64,abc')).toBe(true);
    expect(isBase64('data:image/gif;base64,xyz')).toBe(true);
  });
  it('returns false for http URLs', () => {
    expect(isBase64('https://example.com/img.png')).toBe(false);
  });
});

describe('safeProductImageUrl', () => {
  it('returns placeholder for empty or non-string', () => {
    expect(safeProductImageUrl('')).toBe(EMPTY_IMAGE_DATA_URL);
    expect(safeProductImageUrl('   ')).toBe(EMPTY_IMAGE_DATA_URL);
  });

  it('returns data: URLs as-is', () => {
    const data = 'data:image/png;base64,abc123';
    expect(safeProductImageUrl(data)).toBe(data);
  });

  it('returns placeholder for arbitrary http URL', () => {
    expect(safeProductImageUrl('https://evil.com/image.png')).toBe(EMPTY_IMAGE_DATA_URL);
    expect(safeProductImageUrl('http://example.com/photo.jpg')).toBe(EMPTY_IMAGE_DATA_URL);
  });
});
