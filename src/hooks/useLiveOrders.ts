import { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
import { useLiveOrderStore } from '../stores/liveOrderStore';
import type { Order } from '../lib/types';

/**
 * Live order feed — global store + pending-optimistic guard.
 * Prevents a stale poll/realtime fetch from overwriting a 0ms optimistic
 * patch before the server has committed, and prevents duplicate clicks.
 */
export default function useLiveOrders(limit = 40, pollMs = 5000) {
  const { orders, setOrders, patchOrder, removeOrder, addOrder, upsertOrder } = useLiveOrderStore();
  const [loading, setLoading] = useState(() => orders.length === 0);
  // ids with an in-flight optimistic update — refresh must not overwrite them
  const pendingRef = useRef<Map<number, Partial<Order>>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const data = await api<Order[]>(`/api/orders?limit=${limit}`);
      // merge: keep optimistic pending rows instead of stale server rows
      if (pendingRef.current.size > 0) {
        const pending = pendingRef.current;
        const merged = data.map((o) => (pending.has(o.id) ? { ...o, ...pending.get(o.id)! } : o));
        // also keep optimistic newly-added negatives that server hasn't returned yet
        const serverIds = new Set(data.map((o) => o.id));
        for (const [id, patch] of pending.entries()) {
          if (id < 0 && !serverIds.has(id)) {
            const existing = orders.find((x) => x.id === id);
            if (existing) merged.unshift({ ...existing, ...patch } as Order);
          }
        }
        setOrders(merged);
      } else {
        setOrders(data);
      }
    } catch (err) {
      console.error('[live-orders] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, setOrders, orders]);

  // wrapped helpers that track pending
  const optimisticPatch = useCallback((id: number, patch: Partial<Order>) => {
    pendingRef.current.set(id, { ...(pendingRef.current.get(id) || {}), ...patch });
    patchOrder(id, patch);
  }, [patchOrder]);

  const confirmPatch = useCallback((id: number) => {
    pendingRef.current.delete(id);
  }, []);

  const rollbackPatch = useCallback((id: number, prev: Partial<Order>) => {
    pendingRef.current.delete(id);
    patchOrder(id, prev);
  }, [patchOrder]);

  const optimisticAdd = useCallback((order: Order) => {
    pendingRef.current.set(order.id, order as Partial<Order>);
    addOrder(order);
  }, [addOrder]);

  const confirmAdd = useCallback((tempId: number, real: Order) => {
    pendingRef.current.delete(tempId);
    removeOrder(tempId);
    upsertOrder(real);
  }, [removeOrder, upsertOrder]);

  const rollbackAdd = useCallback((tempId: number) => {
    pendingRef.current.delete(tempId);
    removeOrder(tempId);
  }, [removeOrder]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, pollMs);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('restolink-orders-feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refresh);
      channel.subscribe();
    } catch (err) {
      console.error('[live-orders] realtime unavailable, polling fallback active:', err);
    }

    return () => {
      clearInterval(iv);
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {
        /* already torn down */
      }
    };
  }, [refresh, pollMs]);

  return { orders, loading, refresh, patchOrder: optimisticPatch, confirmPatch, rollbackPatch, addOrder: optimisticAdd, confirmAdd, rollbackAdd, removeOrder, upsertOrder, setOrders, pendingRef };
}
