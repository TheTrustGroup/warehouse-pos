/**
 * SyncService conflict scenarios: last-write-wins, resolve/reject, apply resolution (keep_local, keep_server, merge, serverDeleted).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './syncService';

const mockProductsUpdate = vi.fn(() => Promise.resolve());
const mockProductsDelete = vi.fn(() => Promise.resolve());
const mockQueueUpdate = vi.fn(() => Promise.resolve());
const mockQueueDelete = vi.fn(() => Promise.resolve());

vi.mock('../db/inventoryDB', () => ({
  db: {
    syncQueue: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          sortBy: vi.fn(() => Promise.resolve([])),
        })),
      })),
      update: (...args) => mockQueueUpdate(...args),
      delete: (...args) => mockQueueDelete(...args),
    },
    products: {
      update: (...args) => mockProductsUpdate(...args),
      delete: (...args) => mockProductsDelete(...args),
    },
  },
  setSyncError: vi.fn(() => Promise.resolve()),
  getConflictPreference: vi.fn(() => Promise.resolve(null)),
  appendConflictAuditLog: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/api', () => ({ API_BASE_URL: 'https://test.example.com' }));

const mockApiPut = vi.fn();
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('../lib/apiClient', () => ({
  apiGet: (...args) => mockApiGet(...args),
  apiPut: (...args) => mockApiPut(...args),
  apiPost: (...args) => mockApiPost(...args),
  apiDelete: vi.fn(() => Promise.resolve()),
}));

describe('SyncService conflict', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProductsUpdate.mockResolvedValue(undefined);
    mockProductsDelete.mockResolvedValue(undefined);
    mockQueueUpdate.mockResolvedValue(undefined);
    mockQueueDelete.mockResolvedValue(undefined);
    service = new SyncService();
  });

  describe('handleConflict', () => {
    it('returns local when local lastModified >= server updatedAt', () => {
      const local = { id: '1', name: 'Local', lastModified: 2000 };
      const server = { id: '1', name: 'Server', updatedAt: 1000 };
      const resolved = service.handleConflict(local, server);
      expect(resolved.name).toBe('Local');
      expect(resolved.lastModified).toBe(2000);
    });

    it('returns server when server updatedAt > local lastModified', () => {
      const local = { id: '1', name: 'Local', lastModified: 1000 };
      const server = { id: '1', name: 'Server', updatedAt: '2024-01-02T00:00:00.000Z' };
      const resolved = service.handleConflict(local, server);
      expect(resolved.name).toBe('Server');
    });

    it('treats ISO updatedAt on server as timestamp', () => {
      const local = { id: '1', lastModified: 0 };
      const server = { id: '1', updatedAt: '2024-06-01T12:00:00.000Z' };
      const resolved = service.handleConflict(local, server);
      expect(resolved).toEqual(expect.objectContaining(server));
    });
  });

  describe('resolveConflict / rejectConflict', () => {
    it('resolveConflict resolves the pending Promise for the given queueId', async () => {
      const p = service._waitForConflictResolution(1, {
        item: { data: { id: 'p1' } },
        localData: {},
        serverData: {},
      });
      service.resolveConflict(1, { strategy: 'keep_server' });
      const resolution = await p;
      expect(resolution.strategy).toBe('keep_server');
    });

    it('rejectConflict rejects the pending Promise', async () => {
      const p = service._waitForConflictResolution(2, {
        item: { data: { id: 'p2' } },
        localData: {},
        serverData: {},
      });
      service.rejectConflict(2);
      await expect(p).rejects.toThrow(/cancelled/);
    });
  });

  describe('_applyConflictResolution', () => {
    beforeEach(() => {
      mockApiPut.mockResolvedValue({});
      mockApiGet.mockResolvedValue({ id: 's1', name: 'Server', sellingPrice: 10, quantity: 5, updatedAt: new Date().toISOString() });
      mockApiPost.mockResolvedValue({ id: 'new-id' });
    });

    it('keep_server: updates local product from server and removes queue item', async () => {
      const item = {
        operation: 'UPDATE',
        tableName: 'products',
        data: { id: 'local-1', serverId: 's1', name: 'Local' },
      };
      const applied = await service._applyConflictResolution(1, item, { strategy: 'keep_server' });
      expect(applied).toBe(true);
      expect(mockApiGet).toHaveBeenCalled();
      expect(mockProductsUpdate).toHaveBeenCalledWith(
        'local-1',
        expect.objectContaining({ name: 'Server', syncStatus: 'synced' })
      );
      expect(mockQueueDelete).toHaveBeenCalledWith(1);
    });

    it('keep_local: PUTs local payload and removes queue item', async () => {
      const item = {
        operation: 'UPDATE',
        tableName: 'products',
        data: { id: 'local-1', serverId: 's1', name: 'Local', price: 9, quantity: 3, lastModified: 100 },
      };
      const applied = await service._applyConflictResolution(1, item, { strategy: 'keep_local' });
      expect(applied).toBe(true);
      expect(mockApiPut).toHaveBeenCalled();
      expect(mockProductsUpdate).toHaveBeenCalledWith('local-1', expect.objectContaining({ syncStatus: 'synced' }));
      expect(mockQueueDelete).toHaveBeenCalledWith(1);
    });

    it('serverDeleted + keep_server: deletes local product and queue item', async () => {
      const item = {
        operation: 'UPDATE',
        tableName: 'products',
        data: { id: 'local-1', serverId: 's1' },
      };
      const applied = await service._applyConflictResolution(1, item, {
        strategy: 'keep_server',
        serverDeleted: true,
      });
      expect(applied).toBe(true);
      expect(mockProductsDelete).toHaveBeenCalledWith('local-1');
      expect(mockQueueDelete).toHaveBeenCalledWith(1);
    });

    it('serverDeleted + keep_local: POSTs local as new and removes queue item', async () => {
      const item = {
        operation: 'UPDATE',
        tableName: 'products',
        data: { id: 'local-1', name: 'Local', price: 10, quantity: 1 },
      };
      const applied = await service._applyConflictResolution(1, item, {
        strategy: 'keep_local',
        serverDeleted: true,
      });
      expect(applied).toBe(true);
      expect(mockApiPost).toHaveBeenCalled();
      expect(mockProductsUpdate).toHaveBeenCalledWith('local-1', expect.objectContaining({ syncStatus: 'synced' }));
      expect(mockQueueDelete).toHaveBeenCalledWith(1);
    });

    it('merge: PUTs merged payload and updates local', async () => {
      const item = {
        operation: 'UPDATE',
        tableName: 'products',
        data: { id: 'local-1', serverId: 's1' },
      };
      const merged = { id: 'local-1', name: 'Merged', sku: 'SKU-M', price: 15, quantity: 10 };
      const applied = await service._applyConflictResolution(1, item, {
        strategy: 'merge',
        mergedPayload: merged,
      });
      expect(applied).toBe(true);
      expect(mockApiPut).toHaveBeenCalled();
      expect(mockProductsUpdate).toHaveBeenCalledWith('local-1', expect.objectContaining(merged));
      expect(mockQueueDelete).toHaveBeenCalledWith(1);
    });
  });

  describe('_fetchServerVersion', () => {
    it('returns server data on success', async () => {
      mockApiGet.mockResolvedValue({ id: 's1', name: 'Server' });
      const result = await service._fetchServerVersion('s1');
      expect(result).toEqual({ id: 's1', name: 'Server' });
    });

    it('returns null on error', async () => {
      mockApiGet.mockRejectedValue(new Error('404'));
      const result = await service._fetchServerVersion('s1');
      expect(result).toBeNull();
    });
  });
});
