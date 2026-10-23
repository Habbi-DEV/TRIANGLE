import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Heart-marked products on the customer menu. Purely client-side (there is
 *  no customer login) — only product ids are stored, the products themselves
 *  always come fresh from /api/products. */
interface FavoritesState {
  ids: number[];
  toggle: (id: number) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
    }),
    { name: 'triangle_favorites' },
  ),
);
