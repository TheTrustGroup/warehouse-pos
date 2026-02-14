export interface ConflictResolution {
  strategy: string;
  mergedPayload?: Record<string, unknown>;
  serverDeleted?: boolean;
}

export interface SyncService {
  processSyncQueue(): Promise<{ processed: number; failed: number }>;
  startAutoSync(): void;
  stopAutoSync(): void;
  getQueueStatus(): Promise<{ pending: number; syncing: number; failed: number }>;
  getEmitter(): EventTarget;
  resolveConflict(queueId: number, resolution: ConflictResolution): void;
  rejectConflict(queueId: number): void;
}

export const syncService: SyncService;
