import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import useDriverOrders from '../hooks/useDriverOrders';
import { playNewOrderChime } from '../lib/chime';
import type { Order } from '../lib/types';

interface DriverAvailableCtx {
  orders: Order[];
  loading: boolean;
  refresh: () => void;
  /** Orders that arrived after this tab was mounted and haven't been
   *  acknowledged yet — drives the sticky "N new orders" banner. */
  newOrders: Order[];
  dismissNew: () => void;
}

const Ctx = createContext<DriverAvailableCtx | null>(null);

/**
 * Single shared subscription to the "available" order feed for the whole
 * driver shell (see hooks/useDriverOrders). Lives above the router Outlet
 * in DriverLayout so:
 *   - the bottom-nav badge can show the live count without its own poll, and
 *   - a driver looking at the "Active" tab still gets a vibration + sticky
 *     banner the instant a new order lands, instead of only finding out
 *     once they switch to "Available".
 *
 * Runs regardless of online/offline — when offline the API already hands
 * back an empty list (see api/driver-orders.js), so this just naturally
 * shows nothing rather than needing its own online check.
 */
export function DriverAvailableProvider({ children }: { children: ReactNode }) {
  const { orders, loading, refresh } = useDriverOrders('available');
  const [newOrders, setNewOrders] = useState<Order[]>([]);
  const seenIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (seenIds.current === null) {
      // First load after mount: whatever's already sitting there isn't
      // "new" — it just establishes the baseline.
      seenIds.current = new Set(orders.map((o) => o.id));
      return;
    }
    const fresh = orders.filter((o) => !seenIds.current!.has(o.id));
    fresh.forEach((o) => seenIds.current!.add(o.id));

    if (fresh.length > 0) {
      playNewOrderChime();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([120, 60, 120]);
      }
      setNewOrders((prev) => [...prev, ...fresh]);
    }

    // Drop anything that's no longer in the live list (accepted by someone
    // else, or by this driver from another tab) from the banner too.
    setNewOrders((prev) => prev.filter((o) => orders.some((live) => live.id === o.id)));
  }, [orders]);

  const dismissNew = useCallback(() => {
    // Bail out if it's already empty: setNewOrders([]) always creates a
    // brand-new array reference, so calling it unconditionally made React
    // see a "changed" value every time, even when there was nothing to
    // clear. That was the actual bug behind "can't tap Historique/En cours
    // while on Disponibles": DriverAvailablePage clears the banner in a
    // useEffect keyed on this very function, `dismissNew` used to be
    // recreated on every Provider render (no useCallback), so the loop
    // ran: state change -> Provider re-render -> new dismissNew -> effect
    // re-fires -> state change -> ... forever, pinning the main thread so
    // no other tap (including the bottom nav) could get through until a
    // manual reload. useCallback + this early return make dismissNew a
    // stable no-op once the banner is already clear.
    setNewOrders((prev) => (prev.length === 0 ? prev : []));
  }, []);

  return (
    <Ctx.Provider value={{ orders, loading, refresh, newOrders, dismissNew }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDriverAvailable(): DriverAvailableCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDriverAvailable must be used inside DriverAvailableProvider');
  return ctx;
}
