/**
 * DashboardPage: ensures stats are fetched for the warehouse from WarehouseContext
 * (guards against regressing to hardcoded warehouse_id).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage';

const MOCK_WAREHOUSE_ID = 'warehouse-from-context-123';
const MOCK_WAREHOUSE_NAME = 'Test Warehouse';

vi.mock('../contexts/WarehouseContext', () => ({
  useWarehouse: () => ({
    currentWarehouseId: MOCK_WAREHOUSE_ID,
    currentWarehouse: { name: MOCK_WAREHOUSE_NAME },
    setCurrentWarehouseId: vi.fn(),
    warehouses: [],
    isLoading: false,
    refreshWarehouses: vi.fn(),
    isWarehouseSelectedForPOS: true,
    isWarehouseBoundToSession: false,
  }),
}));

describe('DashboardPage', () => {
  let fetchCalls: string[] = [];

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        fetchCalls.push(url);
        return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches products and sales with warehouse_id from context', async () => {
    render(<DashboardPage />);

    await waitFor(
      () => {
        const productCall = fetchCalls.find((u) => u.includes('/api/products') && u.includes('warehouse_id='));
        const salesCall = fetchCalls.find((u) => u.includes('/api/sales') && u.includes('warehouse_id='));
        expect(productCall, 'products request must include warehouse_id from context').toBeDefined();
        expect(salesCall, 'sales request must include warehouse_id from context').toBeDefined();
        expect(productCall).toContain(encodeURIComponent(MOCK_WAREHOUSE_ID));
        expect(salesCall).toContain(encodeURIComponent(MOCK_WAREHOUSE_ID));
      },
      { timeout: 3000 }
    );
  });
});
