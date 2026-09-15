import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { api } from '../lib/api';
import { useLiveOrderStore } from '../stores/liveOrderStore';
import type { Order } from '../lib/types';

/**
 * Live order feed — now backed by a global Zustand store so every admin
 * surface (OrdersPage, DashboardPage, RegisterPage) sees the same 0ms
 * optimistic patch instantly, not just the component that triggered it.
 */
export default function useLiveOrders(limit = 40, pollMs = 5000) {
  const { orders, setOrders, patchOrder, removeOrder, addOrder, upsertOrder } = useLiveOrderStore();
  const [loading, setLoading] = useState(() => orders.length === 0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Order[]>(`/api/orders?limit=${limit}`);
      setOrders(data);
    } catch (err) {
      console.error('[live-orders] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, setOrders]);

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

  return { orders, loading, refresh, patchOrder, removeOrder, addOrder, upsertOrder, setOrders };
}
