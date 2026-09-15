import { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
import { onOrderAccepted } from '../lib/driverBus';
import { useDriverOrderStore } from '../stores/driverOrderStore';
import type { Order } from '../lib/types';

/**
 * Driver order feed — mine vs available now share global stores so
 * an optimistic accept in AvailableOrderCard instantly reflects in the
 * driver's "En cours" tab without waiting for polling.
 * Includes pending guard so a stale poll doesn't overwrite optimistic.
 */
export default function useDriverOrders(scope: 'available' | 'mine', pollMs = 4000) {
  const store = useDriverOrderStore();
  const orders = scope === 'mine' ? store.mine : store.available;
  const setOrders = scope === 'mine' ? store.setMine : store.setAvailable;
  const [loading, setLoading] = useState(() => orders.length === 0);
  const pendingPatchRef = useRef<Map<number, Partial<Order>>>(new Map());
  const pendingRemoveRef = useRef<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await api<Order[]>(`/api/driver-orders?scope=${scope}`);
      let merged = data;
      if (pendingPatchRef.current.size > 0) {
        merged = merged.map((o) => (pendingPatchRef.current.has(o.id) ? { ...o, ...pendingPatchRef.current.get(o.id)! } : o));
      }
      if (pendingRemoveRef.current.size > 0) {
        merged = merged.filter((o) => !pendingRemoveRef.current.has(o.id));
      }
      setOrders(merged);
    } catch (err) {
      console.error('[driver-orders] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [scope, setOrders]);

  const patchOrder = useCallback((id: number, patch: Partial<Order>) => {
    pendingPatchRef.current.set(id, { ...(pendingPatchRef.current.get(id) || {}), ...patch });
    if (scope === 'mine') store.patchMine(id, patch);
    else {
      useDriverOrderStore.setState((s) => ({
        available: s.available.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      }));
    }
  }, [scope, store]);

  const confirmPatch = useCallback((id: number) => {
    pendingPatchRef.current.delete(id);
  }, []);

  const rollbackPatch = useCallback((id: number, prev: Partial<Order>) => {
    pendingPatchRef.current.delete(id);
    if (scope === 'mine') store.patchMine(id, prev);
    else {
      useDriverOrderStore.setState((s) => ({
        available: s.available.map((o) => (o.id === id ? { ...o, ...prev } : o)),
      }));
    }
  }, [scope, store]);

  const removeOrder = useCallback((id: number) => {
    pendingRemoveRef.current.add(id);
    if (scope === 'mine') store.removeMine(id);
    else store.removeAvailable(id);
  }, [scope, store]);

  const confirmRemove = useCallback((id: number) => {
    pendingRemoveRef.current.delete(id);
  }, []);

  const rollbackRemove = useCallback((order: Order) => {
    pendingRemoveRef.current.delete(order.id);
    if (scope === 'mine') useDriverOrderStore.setState((s) => ({ mine: [order, ...s.mine] }));
    else useDriverOrderStore.setState((s) => ({ available: [order, ...s.available] }));
  }, [scope]);

  const addOrder = useCallback((order: Order) => {
    if (scope === 'mine') useDriverOrderStore.setState((s) => ({ mine: [order, ...s.mine] }));
    else useDriverOrderStore.setState((s) => ({ available: [order, ...s.available] }));
  }, [scope]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, pollMs);

    const channel = supabase.channel(`triangle-driver-orders-${scope}`);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: 'order_type=eq.delivery' },
      refresh,
    );

    if (scope === 'available') {
      channel
        .on('broadcast', { event: 'order_ready' }, refresh)
        .on('broadcast', { event: 'order_taken' }, refresh)
        .on('broadcast', { event: 'order_removed' }, refresh);
    }

    try {
      channel.subscribe();
    } catch (err) {
      console.error('[driver-orders] realtime unavailable, polling fallback active:', err);
    }

    const unsubscribeBus = scope === 'mine' ? onOrderAccepted(refresh) : undefined;

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
      unsubscribeBus?.();
    };
  }, [refresh, pollMs, scope]);

  return { orders, loading, refresh, patchOrder, confirmPatch, rollbackPatch, removeOrder, confirmRemove, rollbackRemove, addOrder, setOrders };
}
