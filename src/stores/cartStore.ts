import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, Sauce, Supplement } from '../lib/types';

export interface CartLine {
  /** Stable identity of this line: product + exact sauce + supplement
   *  selection, so the same product with a different add-on combo doesn't
   *  get merged into an existing line. */
  key: string;
  product: Product;
  qty: number;
  sauces: Sauce[];
  supplements: Supplement[];
}

/** Two lines are "the same" only if they're the same product AND the same
 *  set of sauces AND the same set of supplements (order-independent).
 *  Exported so callers (the cashier register's sauce/supplement panel) can
 *  predict a line's key before it exists — e.g. right after add() — without
 *  duplicating the hashing logic. */
export const lineKey = (productId: number, sauces: Sauce[], supplements: Supplement[]): string =>
  `${productId}:${sauces.map((s) => s.id).sort((a, b) => a - b).join(',')}:${supplements.map((s) => s.id).sort((a, b) => a - b).join(',')}`;

const linePrice = (l: CartLine): number =>
  l.product.price
  + l.sauces.reduce((n, s) => n + s.price, 0)
  + l.supplements.reduce((n, s) => n + s.price, 0);

interface CartState {
  lines: CartLine[];
  add: (p: Product, qty?: number, sauces?: Sauce[], supplements?: Supplement[]) => void;
  inc: (key: string) => void;
  dec: (key: string) => void;
  remove: (key: string) => void;
  /** Replaces an existing line's sauce/supplement selection (used by the
   *  cashier register's standalone Sauces & Suppléments panel, which edits
   *  an already-added ticket line instead of requiring the product's own
   *  detail sheet). Since a line's key is derived from its product + addon
   *  selection, changing the addons changes the key — so this either
   *  renames the line in place, or, if another line already has that exact
   *  combo, merges quantities into it instead of creating a duplicate. */
  setLineExtras: (key: string, sauces: Sauce[], supplements: Supplement[]) => void;
  clear: () => void;
}

/**
 * Shared cart (Zustand + localStorage persistence) used by both the
 * customer e-menu and the cashier register.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (p, qty = 1, sauces = [], supplements = []) =>
        set((s) => {
          const key = lineKey(p.id, sauces, supplements);
          const i = s.lines.findIndex((l) => l.key === key);
          if (i >= 0) {
            const lines = [...s.lines];
            lines[i] = { ...lines[i], qty: lines[i].qty + qty };
            return { lines };
          }
          return { lines: [...s.lines, { key, product: p, qty, sauces, supplements }] };
        }),
      inc: (key) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)),
        })),
      dec: (key) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.key === key ? { ...l, qty: Math.max(1, l.qty - 1) } : l)),
        })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      setLineExtras: (key, sauces, supplements) =>
        set((s) => {
          const line = s.lines.find((l) => l.key === key);
          if (!line) return s;
          const newKey = lineKey(line.product.id, sauces, supplements);
          if (newKey === key) {
            return { lines: s.lines.map((l) => (l.key === key ? { ...l, sauces, supplements } : l)) };
          }
          const merged = { ...line, key: newKey, sauces, supplements };
          const rest = s.lines.filter((l) => l.key !== key);
          const existing = rest.find((l) => l.key === newKey);
          if (existing) {
            return {
              lines: rest.map((l) => (l.key === newKey ? { ...l, qty: l.qty + line.qty } : l)),
            };
          }
          return { lines: [...rest, merged] };
        }),
      clear: () => set({ lines: [] }),
    }),
    { name: 'restolink-cart' },
  ),
);

export const selectCount = (s: CartState): number => s.lines.reduce((n, l) => n + l.qty, 0);
export const selectSubtotal = (s: CartState): number =>
  s.lines.reduce((n, l) => n + l.qty * linePrice(l), 0);
