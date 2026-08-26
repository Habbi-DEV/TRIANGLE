import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import type { Order } from '../lib/types';

/**
 * Live order feed: initial load + Supabase Realtime subscription,
 * with a polling fallback so the feed never goes stale even if the
 * realtime publication is disabled.
 */
export default function useLiveOrders(limit = 40, pollMs = 5000) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOrders(await res.json());
    } catch (err) {
      console.error('[live-orders] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, pollMs);

    const channel = supabase
      .channel('restolink-orders-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refresh)
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [refresh, pollMs]);

  return { orders, loading, refresh };
}
