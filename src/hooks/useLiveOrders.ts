import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
import type { Order } from '../lib/types';

/**
 * Live order feed: initial load + Supabase Realtime subscription,
 * with a polling fallback so the feed never goes stale even if the
 * realtime publication is disabled.
 *
 * Exposes optimistic helpers so callers achieve 0ms UI (patch locally
 * BEFORE awaiting the server, rollback on error, no full refetch).
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

  // ---- Optimistic helpers (0ms UI) ----
  const patchOrder = useCallback((id: number, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } as Order : o)));
  }, []);

  const removeOrder = useCallback((id: number) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const addOrder = useCallback((order: Order) => {
    setOrders((prev) => [order, ...prev].slice(0, limit));
  }, [limit]);

  const upsertOrder = useCallback((order: Order) => {
    setOrders((prev) => {
      const i = prev.findIndex((o) => o.id === order.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], ...order };
        return next;
      }
      return [order, ...prev].slice(0, limit);
    });
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

  return { orders, loading, refresh, patchOrder, removeOrder, addOrder, upsertOrder, setOrders };
}
