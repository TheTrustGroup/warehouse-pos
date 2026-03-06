/**
 * Supabase Realtime subscription for instant cross-device inventory and sales updates.
 * Subscribes to warehouse_inventory_by_size, sales, and warehouse_products; on any change
 * invalidates React Query caches so the app refetches clean data (never uses event payload as source of truth).
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

export function useInventoryRealtime(warehouseId: string | null | undefined): void {
  const queryClient = useQueryClient();
  const realtimeContext = useRealtimeContext();
  const setStatusRef = useRef(realtimeContext?.setStatus);
  setStatusRef.current = realtimeContext?.setStatus;

  useEffect(() => {
    const setStatus = (s: RealtimeStatus) => setStatusRef.current?.(s);

    if (!warehouseId || !isValidWarehouseId(warehouseId)) {
      setStatus('disconnected');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
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
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
          queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
          queryClient.invalidateQueries({ queryKey: ['dashboard', warehouseId] });
          queryClient.invalidateQueries({ queryKey: ['sales', warehouseId] });
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
