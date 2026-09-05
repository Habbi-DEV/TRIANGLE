// Tiny same-tab pub/sub — fixes the bug where accepting an order on the
// "Disponibles" tab didn't show up under "En cours" until a manual refresh.
//
// Why: DriverActivePage and DriverAvailablePage each hold their OWN
// useDriverOrders() instance ('mine' and 'available' respectively). Calling
// accept() only ever refreshed the 'available' hook (via onAccepted), never
// the 'mine' one. Postgres Realtime doesn't fill that gap either: RLS scopes
// the 'mine' subscription to `driver_id = auth.uid()`, and a row that only
// just became visible to that filter (driver_id was NULL a moment ago) is a
// well-known Realtime/RLS gap — the same reason the 'available' scope
// already needed a Broadcast channel instead of relying on postgres_changes
// alone (see api/_lib/broadcast.js). Without a broadcast dedicated to
// "mine", the accepting driver was stuck waiting for the 4s poll fallback,
// which reads as "I have to pull to refresh every time".
//
// This bus closes the gap for the common case (same tab, same device) for
// free. The 4s poll remains as the fallback for the rare case of a second
// tab/device.
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyOrderAccepted(): void {
  listeners.forEach((fn) => fn());
}

export function onOrderAccepted(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
