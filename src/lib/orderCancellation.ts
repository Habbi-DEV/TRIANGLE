import type { Order } from './types';

/** Must match CANCEL_WINDOW_MS in api/orders/cancel.js — this copy only
 *  drives the UI (hiding/disabling the button, the live countdown); the
 *  server re-checks the real window independently and is the only copy
 *  that can actually be trusted. */
export const CANCEL_WINDOW_MS = 5 * 60 * 1000;

export type CustomerCancelReason =
  | 'changed_mind'
  | 'ordered_by_mistake'
  | 'duplicate_order'
  | 'too_long_wait'
  | 'other';

export const CUSTOMER_CANCEL_REASONS: CustomerCancelReason[] = [
  'changed_mind',
  'ordered_by_mistake',
  'duplicate_order',
  'too_long_wait',
  'other',
];

/** The single client-side rule for showing the Cancel button: strictly
 *  PENDING and inside the 5-minute window. Any other status (confirmed,
 *  preparing, ready, out_for_delivery, completed, cancelled) hides it
 *  immediately — no separate "preparing/shipped" special case is needed
 *  since every one of those is simply "not pending". */
export function canCancelOrder(order: Pick<Order, 'status' | 'created_at'>, now: number = Date.now()): boolean {
  if (order.status !== 'pending') return false;
  const createdAtMs = new Date(order.created_at).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return now - createdAtMs < CANCEL_WINDOW_MS;
}

/** Milliseconds left in the cancellation window, floored at 0. Negative /
 *  expired inputs return 0 rather than a negative number so callers can
 *  use it directly as a countdown without an extra Math.max. */
export function msUntilCancelDeadline(order: Pick<Order, 'created_at'>, now: number = Date.now()): number {
  const createdAtMs = new Date(order.created_at).getTime();
  if (!Number.isFinite(createdAtMs)) return 0;
  return Math.max(0, CANCEL_WINDOW_MS - (now - createdAtMs));
}

/** "4:59" style mm:ss countdown for the button/modal. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
