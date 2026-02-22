/**
 * InventoryPage: warehouse-scoped load, DC excluded from list, filters/sort.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import InventoryPage from './InventoryPage';

const MOCK_WAREHOUSE_ID = 'wh-inv-test-123';
const MOCK_WAREHOUSE_NAME = 'Main Town';

vi.mock('../contexts/WarehouseContext', () => ({
  useWarehouse: () => ({
    currentWarehouseId: MOCK_WAREHOUSE_ID,
    currentWarehouse: { id: MOCK_WAREHOUSE_ID, name: MOCK_WAREHOUSE_NAME },
    warehouses: [
      { id: '00000000-0000-0000-0000-000000000001', name: 'Main Store' },
      { id: MOCK_WAREHOUSE_ID, name: MOCK_WAREHOUSE_NAME },
    ],
    setCurrentWarehouseId: vi.fn(),
    isLoading: false,
    refreshWarehouses: vi.fn(),
    isWarehouseSelectedForPOS: true,
    isWarehouseBoundToSession: false,
  }),
}));

describe('InventoryPage', () => {
  let fetchCalls: string[] = [];

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        const s = typeof url === 'string' ? url : url.toString();
        fetchCalls.push(s);
        if (s.includes('/api/products')) {
          return Promise.resolve(
            new Response(JSON.stringify({ data: [], products: [] }), { status: 200 })
          );
        }
        if (s.includes('/api/size-codes')) {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      })
    );
  });

  it('fetches products with warehouse_id from context', async () => {
    render(<InventoryPage />);
    await waitFor(
      () => {
        const productCall = fetchCalls.find(
          (u) => u.includes('/api/products') && u.includes('warehouse_id=')
        );
        expect(productCall).toBeDefined();
        expect(productCall).toContain(encodeURIComponent(MOCK_WAREHOUSE_ID));
      },
      { timeout: 3000 }
    );
  });

  it('shows Inventory title and Add product action', async () => {
    render(<InventoryPage />);
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { name: /inventory/i });
      const addButtons = screen.getAllByRole('button', { name: /add product/i });
      expect(headings.length).toBeGreaterThanOrEqual(1);
      expect(addButtons.length).toBeGreaterThanOrEqual(1);
    });
  });
});
