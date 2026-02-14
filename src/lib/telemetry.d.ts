export function getTelemetrySnapshot(): Promise<{
  syncSuccessCount: number;
  syncFailCount: number;
  syncSuccessRate: number | null;
  averageSyncTimeMs: number | null;
  offlineDurationMs: number;
  conflictCount: number;
}>;
export function resetTelemetry(): Promise<void>;
export function recordSyncSuccess(durationMs: number): Promise<void>;
export function recordSyncFailure(): Promise<void>;
export function recordOfflineDuration(ms: number): Promise<void>;
export function recordConflict(): Promise<void>;
