/**
 * Privacy-respecting telemetry: sync success rate, average sync time, offline duration, conflict frequency.
 * No user data; metrics only. Stored in Logs DB (telemetry table).
 * @module lib/telemetry
 */

import { logDb } from '../utils/logger';

const TELEMETRY_KEY = 'metrics';

/** @typedef {{ syncSuccessCount: number, syncFailCount: number, syncTotalTimeMs: number, offlineDurationMs: number, conflictCount: number, lastUpdated: number }} TelemetryMetrics */

const DEFAULT = {
  syncSuccessCount: 0,
  syncFailCount: 0,
  syncTotalTimeMs: 0,
  offlineDurationMs: 0,
  conflictCount: 0,
  lastUpdated: 0,
};

async function getMetrics() {
  try {
    const rec = await logDb.telemetry.get(TELEMETRY_KEY);
    return { ...DEFAULT, ...(rec?.value ?? {}) };
  } catch {
    return { ...DEFAULT };
  }
}

async function setMetrics(m) {
  try {
    await logDb.telemetry.put({
      key: TELEMETRY_KEY,
      value: { ...m, lastUpdated: Date.now() },
    });
  } catch (_) {}
}

/**
 * Record a successful sync (call with duration in ms).
 * @param {number} [durationMs=0]
 */
export async function recordSyncSuccess(durationMs = 0) {
  const m = await getMetrics();
  m.syncSuccessCount = (m.syncSuccessCount || 0) + 1;
  m.syncTotalTimeMs = (m.syncTotalTimeMs || 0) + durationMs;
  await setMetrics(m);
}

/**
 * Record a failed sync attempt.
 */
export async function recordSyncFailure() {
  const m = await getMetrics();
  m.syncFailCount = (m.syncFailCount || 0) + 1;
  await setMetrics(m);
}

/**
 * Record offline duration (call when coming back online with total ms offline).
 * @param {number} durationMs
 */
export async function recordOfflineDuration(durationMs) {
  const m = await getMetrics();
  m.offlineDurationMs = (m.offlineDurationMs || 0) + durationMs;
  await setMetrics(m);
}

/**
 * Record a conflict resolution event.
 */
export async function recordConflict() {
  const m = await getMetrics();
  m.conflictCount = (m.conflictCount || 0) + 1;
  await setMetrics(m);
}

/**
 * Get current telemetry snapshot (for admin dashboard). No PII.
 * @returns {Promise<TelemetryMetrics & { syncSuccessRate?: number, averageSyncTimeMs?: number }>}
 */
export async function getTelemetrySnapshot() {
  const m = await getMetrics();
  const totalSyncs = (m.syncSuccessCount || 0) + (m.syncFailCount || 0);
  return {
    ...m,
    syncSuccessRate: totalSyncs > 0 ? (m.syncSuccessCount || 0) / totalSyncs : null,
    averageSyncTimeMs:
      (m.syncSuccessCount || 0) > 0
        ? (m.syncTotalTimeMs || 0) / (m.syncSuccessCount || 1)
        : null,
  };
}

/**
 * Reset telemetry (e.g. for testing or user request).
 * @returns {Promise<void>}
 */
export async function resetTelemetry() {
  await setMetrics({ ...DEFAULT });
}
