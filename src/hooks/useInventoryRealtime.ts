/**
 * Supabase Realtime subscription for instant cross-device inventory and sales updates.
 * Subscribes to warehouse_inventory_by_size, sales, and warehouse_products; on any change
 * invalidates React Query caches and calls onRefetch so the product list state is updated
 * (InventoryContext uses loadProducts(), not useQuery, so invalidation alone does not update UI).
 *
 * Requires: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Enable Replication in Supabase for the three tables.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import { isValidWarehouseId } from '../lib/warehouseId';
import { useRealtimeContext } from '../contexts/RealtimeContext';
import type { RealtimeStatus } from '../contexts/RealtimeContext';

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

  useEffect(() => {
    const setStatus = (s: RealtimeStatus) => setStatusRef.current?.(s);
    const refetch = () => runRefetch(onRefetchRef.current);

    if (!warehouseId || !isValidWarehouseId(warehouseId)) {
      setStatus('disconnected');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      if (typeof console !== 'undefined' && !(window as unknown as { __realtimeConfigWarned?: boolean }).__realtimeConfigWarned) {
        (window as unknown as { __realtimeConfigWarned?: boolean }).__realtimeConfigWarned = true;
        console.warn(
          '[Realtime] Not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (e.g. in Vercel env) and redeploy. See docs/REALTIME_OFFLINE.md.'
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
          refetch();
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
          refetch();
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
          refetch();
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
          refetch();
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
          refetch();
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
          queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: ['sales', warehouseId] });
          refetch();
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
