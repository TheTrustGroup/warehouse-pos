/**
 * Fixed sync status bar: shows synced / syncing / offline / failed.
 * Click opens SyncQueueModal. Auto-hides when everything is synced.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, CloudOff, AlertTriangle } from 'lucide-react';
import { useNetworkStatusContext } from '../contexts/NetworkStatusContext';
import { syncService } from '../services/syncService';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDB } from '../db/inventoryDB';
import { SyncQueueModal } from './SyncQueueModal';
import { useAnimations } from '../hooks/useAnimations';
import { syncBarVariants, pulseVariants } from '../animations/liquidGlass';
import { hapticFeedback } from '../lib/haptics';
import { triggerConfetti } from '../lib/confetti';

export function SyncStatusBar() {
  const { isOnline } = useNetworkStatusContext();
  const [modalOpen, setModalOpen] = useState(false);

  const pending =
    useLiveQuery(
      () =>
        getDB()
          .then((d) => (d ? d.syncQueue.where('status').equals('pending').count().catch(() => 0) : 0))
          .catch(() => 0),
      []
    ) ?? 0;
  const syncing =
    useLiveQuery(
      () =>
        getDB()
          .then((d) => (d ? d.syncQueue.where('status').equals('syncing').count().catch(() => 0) : 0))
          .catch(() => 0),
      []
    ) ?? 0;
  const failed =
    useLiveQuery(
      () =>
        getDB()
          .then((d) => (d ? d.syncQueue.where('status').equals('failed').count().catch(() => 0) : 0))
          .catch(() => 0),
      []
    ) ?? 0;

  const total = pending + syncing + failed;

  const [syncingFromEvent, setSyncingFromEvent] = useState(false);
  const { reduced } = useAnimations();
  const barVariants = syncBarVariants(reduced);
  const pulse = pulseVariants(reduced);

  useEffect(() => {
    const emitter = syncService.getEmitter();
    const onStart = () => setSyncingFromEvent(true);
    const onDone = (e: CustomEvent<{ summary?: { synced?: number[] } }>) => {
      setSyncingFromEvent(false);
      const syncedCount = e.detail?.summary?.synced?.length ?? 0;
      if (syncedCount > 0) {
        hapticFeedback([10, 50, 10]);
        if (syncedCount >= 5) triggerConfetti(40);
      }
    };
    emitter.addEventListener('sync-started', onStart as EventListener);
    emitter.addEventListener('sync-completed', onDone as EventListener);
    emitter.addEventListener('sync-failed', onDone as EventListener);
    return () => {
      emitter.removeEventListener('sync-started', onStart as EventListener);
      emitter.removeEventListener('sync-completed', onDone as EventListener);
      emitter.removeEventListener('sync-failed', onDone as EventListener);
    };
  }, []);

  const isSyncing = syncing > 0 || syncingFromEvent;

  type Variant = 'synced' | 'syncing' | 'offline' | 'failed' | null;
  let variant: Variant = null;
  let label = '';
  let icon = null;
  let barClass = '';

  if (failed > 0) {
    variant = 'failed';
    label = 'Sync failed — check connection';
    icon = <AlertTriangle className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />;
    barClass = 'bg-[var(--edk-red)] text-white';
  } else if (!isOnline && total > 0) {
    variant = 'offline';
    label = `Offline — ${total} change${total !== 1 ? 's' : ''} pending`;
    icon = <CloudOff className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />;
    barClass = 'bg-[var(--edk-amber-bg)] text-[var(--edk-amber)] border-t border-[var(--edk-amber)]/30';
  } else if (isSyncing || total > 0) {
    variant = 'syncing';
    const n = total || 1;
    label = `Syncing ${n} item${n !== 1 ? 's' : ''}…`;
    icon = <Loader2 className="w-5 h-5 animate-spin shrink-0" strokeWidth={2} aria-hidden />;
    barClass = 'bg-[var(--edk-amber)] text-white';
  } else if (total === 0 && isOnline) {
    variant = 'synced';
    label = 'All changes synced';
    icon = <Check className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />;
    barClass = 'bg-[var(--edk-green)] text-white';
  }

  const [showSyncedUntil, setShowSyncedUntil] = useState(0);
  useEffect(() => {
    if (variant === 'synced') {
      setShowSyncedUntil(Date.now() + 3000);
      const t = setTimeout(() => setShowSyncedUntil(0), 3000);
      return () => clearTimeout(t);
    } else {
      setShowSyncedUntil(0);
    }
  }, [total, variant]);

  const showBar = variant !== null && (variant !== 'synced' || showSyncedUntil > 0);

  return (
    <>
      <AnimatePresence mode="wait">
        {showBar && (
          <motion.div
            key={variant ?? 'bar'}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={barVariants}
            className={`fixed left-0 right-0 bottom-0 z-[65] rounded-t-[var(--edk-radius)] ${barClass} shadow-[0_-2px_12px_rgba(0,0,0,0.08)]`}
            style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
          >
            <motion.button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-full px-4 py-3 flex items-center justify-center gap-2 text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              aria-label="View sync queue"
              {...(variant === 'syncing' ? pulse : {})}
            >
              {icon}
              <span>{label}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      <SyncQueueModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
