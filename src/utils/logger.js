/**
 * Central logging utility: levels DEBUG, INFO, WARN, ERROR.
 * Stores logs in IndexedDB (logs table), keeps last 1000, supports export.
 * In Node/test environments (no IndexedDB), writes are skipped; in-memory buffer and
 * subscribeToLogs still work for the current process.
 *
 * @module utils/logger
 * @example
 * import { logSync, logError, getLogs, exportLogs } from '../utils/logger';
 * logSync('sync started', { total: 5 });
 * logError(new Error('Failed'), { context: 'save' });
 * const logs = await getLogs(50);
 * const json = await exportLogs(1000);
 */

import Dexie from 'dexie';

const MAX_LOGS = 1000;
const LOG_DB_NAME = 'WarehousePOSLogsDB';

/** @typedef {'DEBUG' | 'INFO' | 'WARN' | 'ERROR'} LogLevel */

/**
 * Dexie database for logs and telemetry. Separate from main app DB to avoid schema coupling.
 * Tables: logs (++id, level, category, timestamp), telemetry (key).
 */
class LogsDexie extends Dexie {
  constructor() {
    super(LOG_DB_NAME);
    this.version(1).stores({
      logs: '++id, level, category, timestamp',
      telemetry: 'key',
    });
    this.logs = this.table('logs');
    this.telemetry = this.table('telemetry');
  }
}

const logDb = new LogsDexie();

/** In-memory buffer for real-time subscribers (e.g. debug panel). Last 200 entries. */
const RECENT_BUFFER_MAX = 200;
const recentBuffer = [];
const logSubscribers = new Set();

function emitToSubscribers(entry) {
  try {
    logSubscribers.forEach((cb) => {
      try {
        cb(entry);
      } catch (_) {}
    });
  } catch (_) {}
}

function getMinLevel() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return 'DEBUG';
  return 'INFO';
}

const LEVEL_ORDER = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function shouldLog(level) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];
}

/**
 * Persist and optionally emit a log entry. Always pushes to in-memory buffer and notifies
 * subscribers; persistence to IndexedDB is skipped when level is below getMinLevel() or
 * when indexedDB is undefined (e.g. Node/Vitest).
 *
 * @param {LogLevel} level
 * @param {string} category - 'sync' | 'db' | 'network' | 'error' | 'app'
 * @param {string} message
 * @param {*} [data] - Optional payload (cloned if plain object; avoid passing non-serializable values).
 */
async function writeLog(level, category, message, data) {
  const entry = {
    level,
    category,
    message,
    data: data !== undefined ? (typeof data === 'object' && data !== null ? { ...data } : data) : undefined,
    timestamp: Date.now(),
  };
  if (recentBuffer.length >= RECENT_BUFFER_MAX) recentBuffer.shift();
  recentBuffer.push(entry);
  emitToSubscribers(entry);

  if (!shouldLog(level)) return;

  if (typeof indexedDB === 'undefined') return;

  try {
    await logDb.logs.add(entry);
    const count = await logDb.logs.count();
    if (count > MAX_LOGS) {
      const toDelete = await logDb.logs.orderBy('id').limit(count - MAX_LOGS).keys();
      await logDb.logs.bulkDelete(toDelete);
    }
  } catch (e) {
    if (import.meta.env?.DEV && typeof console !== 'undefined' && console.warn) {
      console.warn('[Logger] Failed to write to IndexedDB:', e);
    }
  }
}

/**
 * Log sync operations.
 * @param {string} message
 * @param {*} [data]
 */
export function logSync(message, data) {
  writeLog('INFO', 'sync', message, data);
}

/**
 * Log IndexedDB operations.
 * @param {string} message
 * @param {*} [data]
 */
export function logDB(message, data) {
  writeLog('DEBUG', 'db', message, data);
}

/**
 * Log network events.
 * @param {string} message
 * @param {*} [data]
 */
export function logNetwork(message, data) {
  writeLog('INFO', 'network', message, data);
}

/**
 * Log errors with stack trace.
 * @param {Error|unknown} error
 * @param {Record<string, unknown>} [context]
 */
export function logError(error, context) {
  const err = error instanceof Error ? error : new Error(String(error));
  const data = {
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...(context && typeof context === 'object' ? context : {}),
  };
  writeLog('ERROR', 'error', err.message, data);
}

/** Log at DEBUG level (generic). */
export function logDebug(message, data) {
  writeLog('DEBUG', 'app', message, data);
}

/** Log at INFO level (generic). */
export function logInfo(message, data) {
  writeLog('INFO', 'app', message, data);
}

/** Log at WARN level (generic). */
export function logWarn(message, data) {
  writeLog('WARN', 'app', message, data);
}

/**
 * Get recent logs from IndexedDB (newest first).
 * @param {number} [limit=100]
 * @param {LogLevel} [minLevel]
 * @returns {Promise<Array<{id: number, level: string, category: string, message: string, data?: *, timestamp: number}>>}
 */
export async function getLogs(limit = 100, minLevel) {
  let q = logDb.logs.orderBy('timestamp').reverse();
  const all = await q.limit(limit * 2).toArray();
  const filtered = minLevel
    ? all.filter((e) => LEVEL_ORDER[e.level] >= LEVEL_ORDER[minLevel])
    : all;
  return filtered.slice(0, limit);
}

/**
 * Export logs as JSON (for debugging).
 * @param {number} [limit=1000]
 * @returns {Promise<string>} JSON string
 */
export async function exportLogs(limit = 1000) {
  const logs = await logDb.logs.orderBy('timestamp').reverse().limit(limit).toArray();
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), count: logs.length, logs },
    null,
    2
  );
}

/**
 * Clear all logs from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearLogs() {
  await logDb.logs.clear();
  recentBuffer.length = 0;
}

/**
 * Get in-memory recent buffer (for debug panel streaming).
 * @returns {Array<{level: string, category: string, message: string, data?: *, timestamp: number}>}
 */
export function getRecentLogBuffer() {
  return [...recentBuffer];
}

/**
 * Subscribe to new log entries (real-time). Returns unsubscribe function.
 * @param {(entry: object) => void} callback
 * @returns {() => void}
 */
/**
 * Subscribe to new log entries (real-time). Callback is invoked for every new log;
 * return value is an unsubscribe function. Edge case: callback exceptions are caught
 * so one bad subscriber does not break others.
 *
 * @param {(entry: object) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function subscribeToLogs(callback) {
  logSubscribers.add(callback);
  return () => logSubscribers.delete(callback);
}

export { logDb };
