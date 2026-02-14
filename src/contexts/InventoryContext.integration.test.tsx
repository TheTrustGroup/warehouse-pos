/**
 * Inventory reliability tests (P0).
 * - Optimistic save: when API returns 200, addProduct resolves immediately and state is updated (verify runs in background).
 * - Success: when API returns 200 and read-back includes the product, addProduct resolves and product is in state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from './ToastContext';
import { WarehouseProvider } from './WarehouseContext';
import { InventoryProvider, useInventory } from './InventoryContext';

// Mock API client so we control success vs disaster (read-back missing).
vi.mock('../lib/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  API_BASE_URL: 'https://test.example.com',
}));

vi.mock('../lib/storage', () => ({
  getStoredData: () => [],
  setStoredData: () => true,
  isStorageAvailable: () => true,
}));

vi.mock('../lib/offlineDb', () => ({
  loadProductsFromDb: () => Promise.resolve([]),
  saveProductsToDb: () => Promise.resolve(),
  isIndexedDBAvailable: () => false,
}));

vi.mock('../lib/observability', () => ({
  reportError: vi.fn(),
}));

vi.mock('../lib/inventoryLogger', () => ({
  logInventoryCreate: vi.fn(),
  logInventoryUpdate: vi.fn(),
  logInventoryRead: vi.fn(),
  logInventoryError: vi.fn(),
}));

vi.mock('../hooks/useRealtimeSync', () => ({
  useRealtimeSync: () => {},
}));

import { apiGet, apiPost } from '../lib/apiClient';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>
    <WarehouseProvider>
      <InventoryProvider>{children}</InventoryProvider>
    </WarehouseProvider>
  </ToastProvider>
);

const minimalProduct = {
  name: 'Test Product',
  sku: 'SKU-TEST-001',
  barcode: '',
  description: '',
  category: 'General',
  tags: [],
  quantity: 10,
  costPrice: 1,
  sellingPrice: 2,
  reorderLevel: 5,
  location: { warehouse: 'W1', aisle: 'A1', rack: 'R1', bin: 'B1' },
  supplier: { name: 'S', contact: '', email: '' },
  images: [],
  expiryDate: null,
  createdBy: 'test',
};

describe('InventoryContext reliability', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiGet).mockResolvedValue([]);
  });

  it('optimistic save: when API returns 200, addProduct resolves immediately and product is in state (verify runs in background)', async () => {
    const newId = 'new-product-id-123';
    const saved = { id: newId, ...minimalProduct, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    vi.mocked(apiPost).mockResolvedValue(saved);
    // Initial load returns []; by-id verify (path includes product id) returns single product so background verify does not overwrite state
    vi.mocked(apiGet).mockImplementation(async (_base: string, path: string) => {
      if (typeof path === 'string' && path.includes(newId)) return saved;
      return [];
    });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading === false).toBe(true);
    });

    await act(async () => {
      await result.current.addProduct(minimalProduct);
    });

    await waitFor(() => {
      expect(result.current.products.length).toBe(1);
    });
    expect(result.current.products[0].id).toBe(newId);
    expect(apiPost).toHaveBeenCalled();
  });

  it('success: when API returns 200 and read-back includes the product, addProduct resolves (device B sees inventory in 1 request)', async () => {
    const newId = 'new-product-id-456';
    const saved = {
      id: newId,
      ...minimalProduct,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(apiPost).mockResolvedValue(saved);
    // Return [saved] only for the read-back GET (after addProduct's POST). All other GETs (warehouses, initial products) return [].
    vi.mocked(apiGet).mockImplementation(async (_base: string, path: string) => {
      const isProductList = typeof path === 'string' && path.includes('products');
      if (!isProductList) return [];
      // Read-back happens after apiPost; initial load happens before. So only return [saved] when POST has been called.
      if (vi.mocked(apiPost).mock.calls.length > 0) return [saved];
      return [];
    });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading === false).toBe(true);
    });

    await act(async () => {
      await result.current.addProduct(minimalProduct);
    });

    expect(result.current.products.length).toBe(1);
    expect(result.current.products[0].id).toBe(newId);
    expect(apiGet).toHaveBeenCalled();
  });
});
