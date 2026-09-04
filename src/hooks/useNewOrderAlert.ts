import { useEffect, useRef, useState } from 'react';
import type { Order } from '../lib/types';
import { playNewOrderChime } from '../lib/chime';

/**
 * Watches for brand-new pending orders (the kitchen hasn't acknowledged
 * them yet) and plays a short, one-shot sound (see lib/chime.ts) the
 * moment one shows up — not a loop, just a normal alert.
 *
 * - On first poll after mount/enable, the currently-pending orders become
 *   the baseline (no sound) — only orders that show up *after* that count
 *   as "new".
 * - The returned list drives a small visual banner so a new order is
 *   still visible even after its sound has already played; it clears an
 *   order automatically once it's handled elsewhere (e.g. confirmed from
 *   the Orders page), or immediately via dismiss().
 */
export default function useNewOrderAlert(enabled: boolean, pollMs = 5000) {
  const [newOrders, setNewOrders] = useState<Order[]>([]);
  const seenIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    // Fresh baseline every time polling (re)starts — established inside
    // the first poll below (asynchronously), not here, so a stale list
    // from a previous enabled session doesn't briefly flash back in.
    seenIds.current = null;
    if (!enabled) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/orders?status=pending&limit=50');
        if (!res.ok || cancelled) return;
        const data: Order[] = await res.json();
        if (cancelled) return;

        if (seenIds.current === null) {
          // Baseline: orders already pending when we started watching
          // aren't "new" — they're presumably already on someone's radar.
          // Also clears out anything left over from a previous session.
          seenIds.current = new Set(data.map((o) => o.id));
          setNewOrders([]);
          return;
        }

        const fresh = data.filter((o) => !seenIds.current!.has(o.id));
        fresh.forEach((o) => seenIds.current!.add(o.id));

        // One normal sound per poll tick that found something new — not
        // one per order, so five orders landing at once doesn't play five
        // overlapping sounds.
        if (fresh.length > 0) playNewOrderChime();

        // Drop entries that are no longer pending (handled elsewhere,
        // e.g. from the Orders page directly) and merge in anything new.
        setNewOrders((prev) => {
          const stillPending = prev.filter((o) => data.some((d) => d.id === o.id));
          return [...stillPending, ...fresh];
        });
      } catch {
        /* transient network hiccup — try again next tick */
      }
    };

    poll();
    const iv = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [enabled, pollMs]);

  const dismiss = () => setNewOrders([]);

  return { newOrders: enabled ? newOrders : [], dismiss };
}
