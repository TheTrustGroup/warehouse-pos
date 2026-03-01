/**
 * Zod schemas for API request bodies. Use in route handlers to validate input
 * and return 400 with clear messages instead of 500 on malformed JSON or types.
 */
import { z } from 'zod';

const deductItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.coerce.number().int().positive('quantity must be a positive integer'),
});

/** Body for POST /api/inventory/deduct and POST /api/orders/deduct and POST /api/orders/return-stock */
export const warehouseItemsBodySchema = z.object({
  warehouseId: z.string().min(1, 'warehouseId is required'),
  items: z
    .array(deductItemSchema)
    .min(1, 'items must be a non-empty array'),
});

export type WarehouseItemsBody = z.infer<typeof warehouseItemsBodySchema>;
