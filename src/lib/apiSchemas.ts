/**
 * Zod schemas for API response validation (critical paths: auth, optional products).
 * Validates shape so malformed API responses fail fast with clear errors instead of runtime bugs.
 */

import { z } from 'zod';

/** User payload from auth API (login / me). Lenient: only ensures object shape. */
export const authUserPayloadSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    role: z.string().optional(),
    fullName: z.string().optional(),
    name: z.string().optional(),
    avatar: z.string().optional(),
    permissions: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    lastLogin: z.union([z.string(), z.number(), z.date()]).optional(),
    createdAt: z.union([z.string(), z.number(), z.date()]).optional(),
    warehouse_id: z.string().optional(),
    warehouseId: z.string().optional(),
    store_id: z.string().optional(),
    storeId: z.string().optional(),
    device_id: z.string().optional(),
    deviceId: z.string().optional(),
    assignedPos: z.enum(['main_town', 'store']).optional(),
  })
  .passthrough();

/** Login response: { user?, data?: { user?, token?, access_token? }, token?, access_token? } */
export const authLoginResponseSchema = z
  .object({
    user: authUserPayloadSchema.optional(),
    data: z
      .object({
        user: authUserPayloadSchema.optional(),
        token: z.string().optional(),
        access_token: z.string().optional(),
      })
      .passthrough()
      .optional(),
    token: z.string().optional(),
    access_token: z.string().optional(),
  })
  .passthrough();

/**
 * Parse and return the user payload from a login or /me response.
 * Throws if the payload is not a valid object (e.g. API returned string or null).
 */
export function parseAuthUserPayload(data: unknown): z.infer<typeof authUserPayloadSchema> {
  const parsed = authUserPayloadSchema.safeParse(data);
  if (!parsed.success) {
    if (import.meta.env.DEV) console.warn('[apiSchemas] Auth user payload validation failed:', parsed.error.flatten());
    throw new Error('Invalid login response: unexpected user data shape');
  }
  return parsed.data;
}

/**
 * Extract user payload from login response and validate.
 * Handles shapes: { user }, { data: { user } }, or raw user at top level.
 */
export function parseLoginResponse(data: unknown): {
  userPayload: z.infer<typeof authUserPayloadSchema>;
  token?: string;
} {
  const parsed = authLoginResponseSchema.safeParse(data);
  if (!parsed.success) {
    if (import.meta.env.DEV) console.warn('[apiSchemas] Login response validation failed:', parsed.error.flatten());
    throw new Error('Invalid login response');
  }
  const res = parsed.data;
  const userPayloadRaw = res?.user ?? res?.data?.user ?? res;
  if (userPayloadRaw == null || typeof userPayloadRaw !== 'object') {
    throw new Error('Invalid login response: user data missing');
  }
  const userPayload = parseAuthUserPayload(userPayloadRaw);
  const dataObj = res?.data && typeof res.data === 'object' ? res.data as { token?: string; access_token?: string } : null;
  const rawToken = res?.token ?? res?.access_token ?? dataObj?.token ?? dataObj?.access_token;
  const token = typeof rawToken === 'string' ? rawToken : undefined;
  return { userPayload, token };
}

// ---- Products API response ----
/** Single product item from API (lenient: coerces types, allows optional fields). */
const apiProductItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    sku: z.string().optional().default(''),
    barcode: z.string().optional().default(''),
    name: z.string().optional().default(''),
    description: z.string().optional().default(''),
    category: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([]),
    quantity: z.coerce.number().finite().optional().default(0),
    costPrice: z.coerce.number().finite().optional().default(0),
    sellingPrice: z.coerce.number().finite().optional().default(0),
    reorderLevel: z.coerce.number().finite().optional().default(0),
    location: z.record(z.string(), z.unknown()).optional().default({}),
    supplier: z.record(z.string(), z.unknown()).optional().default({}),
    images: z.array(z.string()).optional().default([]),
    expiryDate: z.union([z.string(), z.date(), z.number()]).nullable().optional(),
    createdAt: z.union([z.string(), z.date(), z.number()]).optional(),
    updatedAt: z.union([z.string(), z.date(), z.number()]).optional(),
    createdBy: z.string().optional().default(''),
    version: z.number().optional(),
    sizeKind: z.enum(['na', 'one_size', 'sized']).optional(),
    quantityBySize: z.array(z.object({ sizeCode: z.string(), sizeLabel: z.string().optional(), quantity: z.coerce.number().finite() })).optional(),
  })
  .passthrough();

/** API response: either { data: Product[], total? } or Product[]. */
const apiProductsResponseSchema = z.union([
  z.array(apiProductItemSchema),
  z.object({ data: z.array(apiProductItemSchema), total: z.number().optional() }),
]);

export type ApiProductItem = z.infer<typeof apiProductItemSchema>;

/**
 * Parse products API response. Returns list of items that match expected structure.
 * On validation failure does not overwrite state; caller should set error and keep previous data.
 */
export function parseProductsResponse(raw: unknown): { success: true; items: ApiProductItem[] } | { success: false; message: string } {
  const parsed = apiProductsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    if (import.meta.env.DEV) console.warn('[apiSchemas] Products response validation failed:', parsed.error.flatten());
    return { success: false, message: 'Invalid products response from server' };
  }
  const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.data ?? [];
  return { success: true, items };
}
