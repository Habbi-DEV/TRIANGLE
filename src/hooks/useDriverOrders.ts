import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
import type { Order } from '../lib/types';

/**
 * Driver order feed: initial load via /api/driver-orders + a Realtime
 * subscription on public.orders (delivery rows only), with a polling
 * fallback — same shape as useLiveOrders (admin/kitchen feed), scoped to
 * either the "available to accept" list or "my active deliveries".
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
    const iv = setInterval(refresh, pollMs);

    const channel = supabase
      .channel(`triangle-driver-orders-${scope}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: 'order_type=eq.delivery' },
        refresh,
      )
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [refresh, pollMs, scope]);

  return { orders, loading, refresh };
}
