/**
 * Performance benchmarks for offline/sync: target <100ms for local operations,
 * and acceptable sync batch time. Uses mocks; run with: npm run test -- --run src/__tests__/offline/performance.bench.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from '../../services/syncService';

const mockQueueAdd = vi.fn();
const mockQueueUpdate = vi.fn();
const mockQueueDelete = vi.fn();
const mockProductsUpdate = vi.fn();
const mockWhere = vi.fn(() => ({
  equals: (val) => ({
    sortBy: () => Promise.resolve([]),
    count: () => Promise.resolve(val === 'pending' ? 0 : 0),
  }),
}));

vi.mock('../../db/inventoryDB', () => ({
  db: {
    syncQueue: {
      add: (...args) => mockQueueAdd(...args),
      where: (...args) => mockWhere(...args),
      update: (...args) => mockQueueUpdate(...args),
      delete: (...args) => mockQueueDelete(...args),
    },
    products: { update: (...args) => mockProductsUpdate(...args) },
  },
  setSyncError: vi.fn(() => Promise.resolve()),
  getConflictPreference: vi.fn(() => Promise.resolve(null)),
  appendConflictAuditLog: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/api', () => ({ API_BASE_URL: 'https://test.example.com' }));
const mockApiPost = vi.fn();
vi.mock('../../lib/apiClient', () => ({
  apiPost: (...args) => mockApiPost(...args),
  apiPut: vi.fn(() => Promise.resolve({})),
  apiDelete: vi.fn(() => Promise.resolve()),
  apiGet: vi.fn(() => Promise.resolve({})),
}));

describe('Offline performance benchmarks', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueAdd.mockImplementation((item) => Promise.resolve(item.timestamp % 100000 || 1));
    mockQueueUpdate.mockResolvedValue(undefined);
    mockQueueDelete.mockResolvedValue(undefined);
    mockProductsUpdate.mockResolvedValue(undefined);
    service = new SyncService();
  });

  it('addToQueue: 100 products in under 500ms (target: local ops <100ms each, batch <15s)', async () => {
    const product = {
      id: 'uuid-1',
      name: 'Product',
      sku: 'SKU-1',
      category: 'Toys',
      price: 10,
      quantity: 5,
    };
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      await service.addToQueue('CREATE', 'products', { ...product, id: `uuid-${i}`, sku: `SKU-${i}` });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500); // 100 × <5ms with mocks is reasonable
    expect(mockQueueAdd).toHaveBeenCalledTimes(100);
  });

  it('addToQueue: single add completes in under 100ms', async () => {
    const product = {
      id: 'uuid-single',
      name: 'Single',
      sku: 'SKU-S',
      category: 'Toys',
      price: 1,
      quantity: 1,
    };
    const start = performance.now();
    await service.addToQueue('CREATE', 'products', product);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
