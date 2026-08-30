import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
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

    channel.subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [refresh, pollMs, scope]);

  return { orders, loading, refresh };
}
