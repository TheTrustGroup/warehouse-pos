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

  const mockDashboardResponse = {
    totalStockValue: 1000,
    totalProducts: 5,
    lowStockCount: 1,
    outOfStockCount: 0,
    todaySales: 50,
    lowStockItems: [],
    categorySummary: { Apparel: { count: 5, value: 1000 } },
  };

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        fetchCalls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify(mockDashboardResponse), { status: 200 })
        );
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches dashboard with warehouse_id from context', async () => {
    render(<DashboardPage />);

    await waitFor(
      () => {
        const dashboardCall = fetchCalls.find(
          (u) => u.includes('/api/dashboard') && u.includes('warehouse_id=')
        );
        expect(dashboardCall, 'dashboard request must include warehouse_id from context').toBeDefined();
        expect(dashboardCall).toContain(encodeURIComponent(MOCK_WAREHOUSE_ID));
        expect(dashboardCall).toMatch(/date=/);
      },
      { timeout: 3000 }
    );
  });
});
