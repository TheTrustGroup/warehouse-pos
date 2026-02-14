/**
 * Listens for sync-conflict events and shows ConflictModal. On resolve, calls syncService.resolveConflict.
 */

import { useState, useEffect, useRef } from 'react';
import { ConflictModal, type ConflictVersion } from './ConflictModal';
import { syncService } from '../services/syncService';
import type { ConflictStrategy } from './ConflictModal';

interface ConflictPayload {
  queueId: number;
  item: { operation: string; data: Record<string, unknown> };
  localData: ConflictVersion;
  serverData: ConflictVersion | null;
  serverDeleted?: boolean;
}

export function ConflictModalContainer() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ConflictPayload | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    const handler = (e: CustomEvent<ConflictPayload>) => {
      resolvedRef.current = false;
      setPayload(e.detail);
      setOpen(true);
    };
    const emitter = syncService.getEmitter();
    emitter.addEventListener('sync-conflict', handler as EventListener);
    return () => emitter.removeEventListener('sync-conflict', handler as EventListener);
  }, []);

  const handleClose = () => {
    if (payload && !resolvedRef.current) {
      syncService.rejectConflict(payload.queueId);
    }
    setOpen(false);
    setPayload(null);
  };

  const handleResolve = async (strategy: ConflictStrategy, mergedPayload?: ConflictVersion) => {
    if (!payload) return;
    resolvedRef.current = true;
    syncService.resolveConflict(payload.queueId, {
      strategy,
      mergedPayload: mergedPayload ?? undefined,
      serverDeleted: payload.serverDeleted,
    });
    setOpen(false);
    setPayload(null);
  };

  if (!payload) return null;

  return (
    <ConflictModal
      isOpen={open}
      onClose={handleClose}
      localVersion={payload.localData as ConflictVersion}
      serverVersion={payload.serverData}
      serverDeleted={payload.serverDeleted}
      localDeleted={payload.item.operation === 'DELETE'}
      queueItemId={payload.queueId}
      operation={payload.item.operation}
      onResolve={handleResolve}
    />
  );
}
