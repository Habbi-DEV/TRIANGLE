import supabase from './db-client.js';

// Every driver client subscribes to this one channel while on the
// "available orders" tab. Broadcast (unlike postgres_changes) is NOT
// filtered by RLS — which is exactly the gap this closes: when driver A
// accepts an order, the row's new driver_id makes it fail driver B's
// SELECT policy, so Realtime correctly never delivers that postgres_changes
// UPDATE event to driver B (RLS is doing its job). Without this, driver B's
// UI would only learn the order is gone on their next poll tick — a window
// where they could tap "Accept" on an order that's already taken.
//
// The payload only ever carries an order id, never customer data — clients
// react by calling the normal authenticated, RLS-scoped
// GET /api/driver-orders themselves. Best-effort: a missed broadcast (e.g.
// a client briefly offline) is still caught by that same poll fallback, so
// nothing here is load-bearing for correctness — only for how fast drivers
// find out.
const DRIVER_CHANNEL = 'driver-available-orders';

export const DRIVER_EVENTS = {
  READY: 'order_ready',     // a delivery order just became available
  TAKEN: 'order_taken',     // a driver just accepted it
  REMOVED: 'order_removed', // it left the available pool another way (e.g. cancelled)
};

export async function broadcastDriverEvent(event, orderId) {
  try {
    await supabase.channel(DRIVER_CHANNEL).send({
      type: 'broadcast',
      event,
      payload: { id: orderId },
    });
  } catch (err) {
    console.error('[broadcast]', event, orderId, err);
  }
}
