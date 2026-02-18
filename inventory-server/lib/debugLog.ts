/**
 * Append one NDJSON line to the workspace debug log for agent debugging.
 * Log path: workspace root /.cursor/debug.log (resolved from cwd when run from inventory-server).
 */
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function getLogPath(): string {
  const cwd = process.cwd();
  // When run from warehouse-pos/inventory-server, workspace root is ../..
  if (cwd.endsWith('inventory-server')) return join(cwd, '..', '..', '.cursor', 'debug.log');
  // When run from warehouse-pos, workspace root is ..
  if (cwd.endsWith('warehouse-pos')) return join(cwd, '..', '.cursor', 'debug.log');
  return join(cwd, '.cursor', 'debug.log');
}

export function debugLog(payload: { location: string; message: string; data?: Record<string, unknown>; hypothesisId?: string; timestamp?: number }): void {
  const full = { ...payload, timestamp: payload.timestamp ?? Date.now() };
  try {
    const logPath = getLogPath();
    const dir = join(logPath, '..');
    mkdirSync(dir, { recursive: true });
    appendFileSync(logPath, JSON.stringify(full) + '\n');
  } catch {
    /* no-op */
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
    console.info('[DEBUG_SIZES]', payload.location, payload.message, payload.data ?? '');
  }
}
