/**
 * Supabase Realtime subscription for instant cross-device inventory and sales updates.
 * Phase 7: Uses real warehouse ID only (currentWarehouseId). No sentinel or placeholder subscription.
 * Call with useInventoryRealtime(warehouseId, { onRefetch }) where warehouseId is the current warehouse UUID.
 * Subscribes to warehouse_inventory_by_size and sales filtered by warehouse_id; warehouse_products (all changes).
 * On any change, invalidates React Query caches and calls onRefetch (InventoryContext passes invalidateProducts).
 * Realtime-triggered refetches are debounced (5s) to avoid request storms from burst of events.
 *
 * Requires: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Enable Replication in Supabase for the three tables.
 */

import { useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import { isValidWarehouseId } from '../lib/warehouseId';
import { useRealtimeContext } from '../contexts/RealtimeContext';
import type { RealtimeStatus } from '../contexts/RealtimeContext';
import { debounce } from '../lib/utils';

const REALTIME_REFETCH_DEBOUNCE_MS = 5000;

export interface UseInventoryRealtimeOptions {
  /** When provided, called on every inventory/products/sales change so the app can refetch and update state (required for cross-tab/cross-device sync). */
  onRefetch?: () => void;
}

function runRefetch(onRefetch: (() => void) | undefined): void {
  if (typeof onRefetch === 'function') {
    try {
      onRefetch();
    } catch (e) {
      if (import.meta.env?.DEV) console.warn('[Realtime] onRefetch error:', e);
    }
  }
}

export function useInventoryRealtime(
  warehouseId: string | null | undefined,
  options: UseInventoryRealtimeOptions = {}
): void {
  const { onRefetch } = options;
  const queryClient = useQueryClient();
  const realtimeContext = useRealtimeContext();
  const setStatusRef = useRef(realtimeContext?.setStatus);
  setStatusRef.current = realtimeContext?.setStatus;
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  const debouncedRefetch = useMemo(
    () =>
      debounce(() => {
        runRefetch(onRefetchRef.current);
      }, REALTIME_REFETCH_DEBOUNCE_MS),
    []
  );

  useEffect(() => {
    const setStatus = (s: RealtimeStatus) => setStatusRef.current?.(s);

    if (!warehouseId || !isValidWarehouseId(warehouseId)) {
      setStatus('disconnected');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      if (typeof console !== 'undefined' && !(window as unknown as { __realtimeConfigWarned?: boolean }).__realtimeConfigWarned) {
        (window as unknown as { __realtimeConfigWarned?: boolean }).__realtimeConfigWarned = true;
        console.warn(
          '[Realtime] Not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (e.g. in Vercel env) and redeploy. See docs/REALTIME_CROSS_DEVICE_SYNC.md.'
        );
      }
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');

    const channel = supabase
      .channel('warehouse-inventory-' + warehouseId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warehouse_inventory_by_size',
          filter: 'warehouse_id=eq.' + warehouseId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: queryKeys.posProducts(warehouseId) });
          debouncedRefetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sales',
          filter: 'warehouse_id=eq.' + warehouseId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sales', warehouseId] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: queryKeys.reports(warehouseId) });
          debouncedRefetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sales',
          filter: 'warehouse_id=eq.' + warehouseId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sales', warehouseId] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: queryKeys.reports(warehouseId) });
          debouncedRefetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'sales',
          filter: 'warehouse_id=eq.' + warehouseId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sales', warehouseId] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: queryKeys.reports(warehouseId) });
          debouncedRefetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warehouse_products',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: queryKeys.posProducts(warehouseId) });
          debouncedRefetch();
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
          queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: ['sales', warehouseId] });
          debouncedRefetch();
        }
        if (subscriptionStatus === 'CHANNEL_ERROR') setStatus('error');
        if (subscriptionStatus === 'TIMED_OUT') setStatus('connecting');
      });

    return () => {
      supabase.removeChannel(channel);
      setStatus('disconnected');
    };
  }, [warehouseId, queryClient]);
}
