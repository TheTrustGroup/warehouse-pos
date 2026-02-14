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
import { db } from '../db/inventoryDB';
import { SyncQueueModal } from './SyncQueueModal';
import { useAnimations } from '../hooks/useAnimations';
import { syncBarVariants, pulseVariants } from '../animations/liquidGlass';
import { hapticFeedback } from '../lib/haptics';
import { triggerConfetti } from '../lib/confetti';

export function SyncStatusBar() {
  const { isOnline } = useNetworkStatusContext();
  const [modalOpen, setModalOpen] = useState(false);

  const pending = useLiveQuery(() => db.syncQueue.where('status').equals('pending').count(), []) ?? 0;
  const syncing = useLiveQuery(() => db.syncQueue.where('status').equals('syncing').count(), []) ?? 0;
  const failed = useLiveQuery(() => db.syncQueue.where('status').equals('failed').count(), []) ?? 0;

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
    label = 'Sync failed - Check connection';
    icon = <AlertTriangle className="w-5 h-5" aria-hidden />;
    barClass = 'bg-red-600 text-white';
  } else if (!isOnline && total > 0) {
    variant = 'offline';
    label = `Working offline - ${total} item${total !== 1 ? 's' : ''} pending`;
    icon = <CloudOff className="w-5 h-5" aria-hidden />;
    barClass = 'bg-amber-500 text-amber-950';
  } else if (isSyncing || total > 0) {
    variant = 'syncing';
    const n = total || 1;
    label = `Syncing ${n} item${n !== 1 ? 's' : ''}...`;
    icon = <Loader2 className="w-5 h-5 animate-spin" aria-hidden />;
    barClass = 'bg-blue-600 text-white';
  } else if (total === 0 && isOnline) {
    variant = 'synced';
    label = 'All changes synced ✓';
    icon = <Check className="w-5 h-5" aria-hidden />;
    barClass = 'bg-emerald-600 text-white';
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
            className={`fixed bottom-0 left-0 right-0 z-[65] ${barClass} shadow-lg`}
          >
            <motion.button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-full px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
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
