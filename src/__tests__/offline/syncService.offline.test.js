/**
 * Offline sync service tests: addToQueue, processSyncQueue (offline/network failure), getQueueStatus, retry/backoff.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from '../../services/syncService';
const mockQueueAdd = vi.fn();
const mockQueueUpdate = vi.fn();
const mockQueueDelete = vi.fn();
const mockProductsUpdate = vi.fn();
const mockWhere = vi.fn(() => ({
  equals: vi.fn(() => ({
    sortBy: vi.fn(() => Promise.resolve([])),
    count: vi.fn(() => Promise.resolve(0)),
  })),
}));

vi.mock('../../db/inventoryDB', () => ({
  db: {
    syncQueue: {
      add: (...args) => mockQueueAdd(...args),
      where: (...args) => mockWhere(...args),
      update: (...args) => mockQueueUpdate(...args),
      delete: (...args) => mockQueueDelete(...args),
    },
    products: {
      update: (...args) => mockProductsUpdate(...args),
    },
  },
  setSyncError: vi.fn(() => Promise.resolve()),
  getConflictPreference: vi.fn(() => Promise.resolve(null)),
  appendConflictAuditLog: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/api', () => ({ API_BASE_URL: 'https://test.example.com' }));

const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
vi.mock('../../lib/apiClient', () => ({
  apiPost: (...args) => mockApiPost(...args),
  apiPut: (...args) => mockApiPut(...args),
  apiDelete: (...args) => mockApiDelete(...args),
  apiGet: vi.fn(() => Promise.resolve({})),
}));

describe('SyncService offline', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueAdd.mockResolvedValue(1);
    mockQueueUpdate.mockResolvedValue(undefined);
    mockQueueDelete.mockResolvedValue(undefined);
    mockProductsUpdate.mockResolvedValue(undefined);
    mockWhere.mockImplementation(() => ({
      equals: (val) => ({
        sortBy: () => Promise.resolve([]),
        count: () =>
          Promise.resolve(val === 'pending' ? 0 : val === 'syncing' ? 0 : 0),
      }),
    }));
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
    service = new SyncService();
  });

  describe('addToQueue', () => {
    it('adds CREATE to queue and returns queue item id', async () => {
      const product = {
        id: 'uuid-1',
        name: 'Test',
        sku: 'SKU-1',
        category: 'Toys',
        price: 10,
        quantity: 5,
      };
      const id = await service.addToQueue('CREATE', 'products', product);
      expect(id).toBe(1);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'CREATE',
          tableName: 'products',
          data: expect.objectContaining({ id: 'uuid-1', name: 'Test' }),
          status: 'pending',
          attempts: 0,
        })
      );
    });

    it('adds UPDATE to queue', async () => {
      await service.addToQueue('UPDATE', 'products', { id: 'uuid-2', name: 'Updated', serverId: 'srv-2' });
      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'UPDATE', tableName: 'products' })
      );
    });

    it('adds DELETE to queue', async () => {
      await service.addToQueue('DELETE', 'products', { id: 'uuid-3', serverId: 'srv-3' });
      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'DELETE', tableName: 'products' })
      );
    });

    it('throws for invalid operation', async () => {
      await expect(service.addToQueue('INVALID', 'products', { id: '1' })).rejects.toThrow(/Invalid operation/);
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('throws for invalid tableName', async () => {
      await expect(service.addToQueue('CREATE', 'orders', { id: '1' })).rejects.toThrow(/Invalid tableName/);
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('throws when data is null', async () => {
      await expect(service.addToQueue('CREATE', 'products', null)).rejects.toThrow(/data must be/);
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe('processSyncQueue when offline', () => {
    it('emits sync-failed when navigator.onLine is false', async () => {
      Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true });
      const events = [];
      service.getEmitter().addEventListener('sync-failed', (e) => events.push(e.detail));
      const summary = await service.processSyncQueue();
      expect(summary.synced).toEqual([]);
      expect(events.length).toBe(1);
      expect(events[0].reason).toBe('offline');
    });
  });

  describe('processSyncQueue with network failure', () => {
    it('increments attempts and keeps item pending on 5xx', async () => {
      const queueItems = [
        {
          id: 1,
          operation: 'CREATE',
          tableName: 'products',
          data: { id: 'u1', name: 'P', sku: 'S', category: 'C', price: 1, quantity: 1 },
          timestamp: Date.now(),
          attempts: 0,
          status: 'pending',
        },
      ];
      mockWhere.mockImplementation(() => ({
        equals: () => ({
          sortBy: () => Promise.resolve(queueItems),
        }),
      }));
      mockApiPost.mockRejectedValueOnce(
        Object.assign(new Error('Server error'), { status: 500 })
      );

      vi.useFakeTimers();
      const promise = service.processSyncQueue();
      await vi.advanceTimersByTimeAsync(3000);
      const summary = await promise;
      vi.useRealTimers();

      expect(mockQueueUpdate).toHaveBeenCalled();
      const updateCall = mockQueueUpdate.mock.calls.find(
        (c) => c[0] === 1 && c[1].attempts !== undefined
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1].attempts).toBe(1);
      expect(updateCall[1].status).toBe('pending');
      expect(summary.pending).toContain(1);
    });
  });

  describe('getQueueStatus', () => {
    it('returns counts for pending, syncing, failed', async () => {
      mockWhere.mockImplementation(() => ({
        equals: (val) => ({
          sortBy: () => Promise.resolve([]),
          count: () =>
            Promise.resolve(
              val === 'pending' ? 2 : val === 'syncing' ? 0 : 0
            ),
        }),
      }));
      const status = await service.getQueueStatus();
      expect(status).toEqual(
        expect.objectContaining({
          pending: 2,
          syncing: 0,
          failed: 0,
        })
      );
    });
  });
});
