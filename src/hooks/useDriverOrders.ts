import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
import { onOrderAccepted } from '../lib/driverBus';
import type { Order } from '../lib/types';

/**
 * Driver order feed: initial load via /api/driver-orders + realtime +
 * polling fallback, same shape as useLiveOrders (admin/kitchen feed).
 *
 * scope === 'available' additionally listens on the 'driver-available-
 * orders' Broadcast channel (see api/_lib/broadcast.js). Broadcast is used
 * here — not just postgres_changes — because RLS correctly stops a
 * driver's postgres_changes subscription from ever seeing a row that no
 * longer matches their SELECT policy (e.g. an order another driver just
 * claimed): that row-disappearing event simply never reaches them via
 * postgres_changes. Broadcast carries just the order id, is delivered
 * instantly to every connected driver regardless of RLS, and triggers the
 * same authenticated refresh() — so every driver's list updates at
 * essentially the same moment, and the accept race window shrinks to
 * milliseconds instead of a full poll interval.
 *
 * Exposes optimistic helpers for 0ms accept / advance / cancel.
 */
export default function useDriverOrders(scope: 'available' | 'mine', pollMs = 4000) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setOrders(await api<Order[]>(`/api/driver-orders?scope=${scope}`));
    } catch (err) {
      console.error('[driver-orders] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const patchOrder = useCallback((id: number, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } as Order : o)));
  }, []);

  const removeOrder = useCallback((id: number) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const addOrder = useCallback((order: Order) => {
    setOrders((prev) => [order, ...prev]);
  }, []);

  useEffect(() => {
    refresh();
    // Kept short and purely as a safety net — broadcast (for 'available')
    // and postgres_changes on the driver's own rows (for 'mine') are the
    // primary signal; this just guarantees no client is ever stuck stale
    // for more than a few seconds if a message is missed.
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

    // CSP or a restrictive in-app browser can make `new WebSocket()` throw
    // synchronously here (Safari iOS: "The operation is insecure"). That must
    // never white-screen the app — the poll interval above is a full fallback.
    try {
      channel.subscribe();
    } catch (err) {
      console.error('[driver-orders] realtime unavailable, polling fallback active:', err);
    }

    // See lib/driverBus.ts: closes the "accept doesn't show under En cours
    // until I refresh" gap for the 'mine' scope, instantly, same-tab.
    const unsubscribeBus = scope === 'mine' ? onOrderAccepted(refresh) : undefined;

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
      unsubscribeBus?.();
    };
  }, [refresh, pollMs, scope]);

  return { orders, loading, refresh, patchOrder, removeOrder, addOrder, setOrders };
}
