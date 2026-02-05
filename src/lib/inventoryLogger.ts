/**
 * Structured logging for inventory operations (P0 reliability).
 * Logs: inventory.create | inventory.update | inventory.read | inventory.error
 * Include: requestId, userContext, environment, latency, and optional DB host / tenant.
 * Use for audit and fail-loud: never swallow without logging.
 */

import { reportError } from './observability';

export type InventoryOp = 'inventory.create' | 'inventory.update' | 'inventory.read' | 'inventory.delete' | 'inventory.error';

export interface InventoryLogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  environment?: string;
  productId?: string;
  sku?: string;
  latencyMs?: number;
  listLength?: number;
  [key: string]: unknown;
}

function requestId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;
}

function envLabel(): string {
  return import.meta.env.PROD ? 'production' : 'development';
}

export function logInventoryOp(
  op: InventoryOp,
  context: InventoryLogContext & { message?: string }
): void {
  const id = context.requestId ?? requestId();
  const payload = {
    op,
    requestId: id,
    userId: context.userId,
    tenantId: context.tenantId,
    environment: context.environment ?? envLabel(),
    productId: context.productId,
    sku: context.sku,
    latencyMs: context.latencyMs,
    listLength: context.listLength,
    ...context,
  };
  if (import.meta.env.DEV) {
    console.info(`[Inventory] ${op}`, payload);
  }
  if (op === 'inventory.error' && context.message) {
    reportError(new Error(context.message), { inventoryLog: payload });
  }
}

export function logInventoryCreate(context: InventoryLogContext): void {
  logInventoryOp('inventory.create', { ...context, requestId: context.requestId ?? requestId() });
}

export function logInventoryUpdate(context: InventoryLogContext): void {
  logInventoryOp('inventory.update', { ...context, requestId: context.requestId ?? requestId() });
}

export function logInventoryRead(context: InventoryLogContext): void {
  logInventoryOp('inventory.read', { ...context, requestId: context.requestId ?? requestId() });
}

export function logInventoryDelete(context: InventoryLogContext): void {
  logInventoryOp('inventory.delete', { ...context, requestId: context.requestId ?? requestId() });
}

export function logInventoryError(message: string, context: InventoryLogContext): void {
  logInventoryOp('inventory.error', { ...context, message, requestId: context.requestId ?? requestId() });
}
