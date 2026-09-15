import { create } from 'zustand';
import type { Order } from '../lib/types';

interface DriverOrderState {
  mine: Order[];
  available: Order[];
  setMine: (orders: Order[]) => void;
  setAvailable: (orders: Order[]) => void;
  patchMine: (id: number, patch: Partial<Order>) => void;
  removeAvailable: (id: number) => void;
  removeMine: (id: number) => void;
}

export const useDriverOrderStore = create<DriverOrderState>((set) => ({
  mine: [],
  available: [],
  setMine: (mine) => set({ mine }),
  setAvailable: (available) => set({ available }),
  patchMine: (id, patch) => set((s) => ({ mine: s.mine.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  removeAvailable: (id) => set((s) => ({ available: s.available.filter((o) => o.id !== id) })),
  removeMine: (id) => set((s) => ({ mine: s.mine.filter((o) => o.id !== id) })),
}));
