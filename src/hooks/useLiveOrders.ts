import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
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
      // Staff-only endpoint (requires Bearer token) — use api(), not raw fetch.
      setOrders(await api<Order[]>(`/api/orders?limit=${limit}`));
    } catch (err) {
      console.error('[live-orders] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, pollMs);

    // Same protection as useDriverOrders: a synchronously-throwing
    // subscribe (blocked WebSocket) must not crash the page — polling covers it.
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

  return { orders, loading, refresh };
}
