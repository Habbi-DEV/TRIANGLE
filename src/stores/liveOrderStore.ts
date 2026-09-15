import { create } from 'zustand';
import type { Order } from '../lib/types';

interface LiveOrderState {
  orders: Order[];
  setOrders: (orders: Order[]) => void;
  patchOrder: (id: number, patch: Partial<Order>) => void;
  removeOrder: (id: number) => void;
  addOrder: (order: Order) => void;
  upsertOrder: (order: Order) => void;
}

export const useLiveOrderStore = create<LiveOrderState>((set) => ({
  orders: [],
  setOrders: (orders) => set({ orders }),
  patchOrder: (id, patch) => set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  removeOrder: (id) => set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
  addOrder: (order) => set((s) => ({ orders: [order, ...s.orders].slice(0, 120) })),
  upsertOrder: (order) => set((s) => {
    const i = s.orders.findIndex((o) => o.id === order.id);
    if (i >= 0) { const next = [...s.orders]; next[i] = { ...next[i], ...order }; return { orders: next }; }
    return { orders: [order, ...s.orders].slice(0, 120) };
  }),
}));
