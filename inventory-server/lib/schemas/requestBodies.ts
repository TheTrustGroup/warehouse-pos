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

/** Body for POST /admin/api/login and POST /api/auth/login */
export const loginBodySchema = z
  .object({
    email: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional().default(''),
    warehouse_id: z.union([z.string(), z.number()]).optional(),
    store_id: z.union([z.string(), z.number()]).optional(),
    device_id: z.union([z.string(), z.number()]).optional(),
  })
  .refine(
    (d) => ((d.email ?? '').trim() || (d.username ?? '').trim()).length > 0,
    { message: 'Email is required', path: ['email'] }
  );

export type LoginBody = z.infer<typeof loginBodySchema>;
