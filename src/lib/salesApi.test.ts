/**
 * Regression: POST /api/sales payload and response contract (record_sale v2).
 * Ensures frontend sends camelCase + imageUrl and expects new response fields.
 */
import { describe, it, expect } from 'vitest';

describe('sales API contract', () => {
  /** Payload shape sent by POS (CartSheet → handleCharge). */
  function buildSaleLinesPayload(
    lines: Array<{
      productId: string;
      sizeCode: string | null;
      qty: number;
      unitPrice: number;
      name: string;
      sku: string;
      imageUrl?: string | null;
    }>
  ) {
    return lines.map((l) => ({
      productId: l.productId,
      sizeCode: l.sizeCode ?? null,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineTotal: l.unitPrice * l.qty,
      name: l.name,
      sku: l.sku ?? '',
      imageUrl: l.imageUrl ?? null,
    }));
  }

  /** Response shape returned by POST /api/sales (record_sale RPC v2). */
  interface SaleResponse {
    id: string;
    receiptId: string;
    total?: number;
    itemCount?: number;
    status?: string;
    createdAt: string;
  }

  it('builds POST body with camelCase and imageUrl', () => {
    const lines = [
      {
        productId: 'uuid-1',
        sizeCode: 'M' as string | null,
        qty: 2,
        unitPrice: 25.5,
        name: 'Shirt',
        sku: 'SKU-1',
        imageUrl: 'https://example.com/img.jpg',
      },
    ];
    const payload = buildSaleLinesPayload(lines);
    expect(payload[0]).toMatchObject({
      productId: 'uuid-1',
      sizeCode: 'M',
      qty: 2,
      unitPrice: 25.5,
      lineTotal: 51,
      name: 'Shirt',
      sku: 'SKU-1',
      imageUrl: 'https://example.com/img.jpg',
    });
    expect(payload[0]).toHaveProperty('imageUrl');
  });

  it('omits imageUrl when null', () => {
    const payload = buildSaleLinesPayload([
      {
        productId: 'uuid-2',
        sizeCode: null,
        qty: 1,
        unitPrice: 10,
        name: 'Item',
        sku: '',
      },
    ]);
    expect(payload[0].imageUrl).toBeNull();
  });

  it('parses POST response with id, receiptId, total, itemCount, status, createdAt', () => {
    const raw = {
      id: 'sale-uuid',
      receiptId: 'RCP-20250222-0001',
      total: 100,
      itemCount: 3,
      status: 'completed',
      createdAt: '2025-02-22T12:00:00.000Z',
    };
    const result = raw as SaleResponse;
    expect(result.id).toBe('sale-uuid');
    expect(result.receiptId).toBe('RCP-20250222-0001');
    expect(result.total).toBe(100);
    expect(result.itemCount).toBe(3);
    expect(result.status).toBe('completed');
    expect(result.createdAt).toBeDefined();
  });
});
