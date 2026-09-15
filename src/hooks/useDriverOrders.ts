import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
import { onOrderAccepted } from '../lib/driverBus';
import { useDriverOrderStore } from '../stores/driverOrderStore';
import type { Order } from '../lib/types';

/**
 * Driver order feed — mine vs available now share global stores so
 * an optimistic accept in AvailableOrderCard instantly reflects in the
 * driver's "En cours" tab without waiting for polling.
 */
export default function useDriverOrders(scope: 'available' | 'mine', pollMs = 4000) {
  const store = useDriverOrderStore();
  const orders = scope === 'mine' ? store.mine : store.available;
  const setOrders = scope === 'mine' ? store.setMine : store.setAvailable;
  const [loading, setLoading] = useState(() => orders.length === 0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Order[]>(`/api/driver-orders?scope=${scope}`);
      setOrders(data);
    } catch (err) {
      console.error('[driver-orders] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [scope, setOrders]);

  const patchOrder = useCallback((id: number, patch: Partial<Order>) => {
    if (scope === 'mine') store.patchMine(id, patch);
    else {
      // available list rarely needs patch (accept removes), but support generic patch
      useDriverOrderStore.setState((s) => ({
        available: s.available.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      }));
    }
  }, [scope, store]);

  const removeOrder = useCallback((id: number) => {
    if (scope === 'mine') store.removeMine(id);
    else store.removeAvailable(id);
  }, [scope, store]);

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

  return { orders, loading, refresh, patchOrder, removeOrder, addOrder, setOrders };
}
