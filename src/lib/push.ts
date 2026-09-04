// Real OS-level push notifications for order-status updates — reach the
// customer even with the site fully closed, unlike the in-page
// `new Notification()` calls already in MenuPage (those only fire while the
// tab's own JS is still running). Requires the service worker (registered
// automatically by vite-plugin-pwa) plus a subscription created here, and a
// server that's actually configured to send (see api/_lib/push.js) — if
// it isn't, subscribeToPush() below simply fails quietly and the app falls
// back to the in-page alerts it already had.

// Push subscription keys arrive base64url-encoded; the Push API wants raw
// bytes. Standard conversion, no library needed for just this.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Prompts for notification permission (must be called from a real click —
 * browsers ignore/auto-deny a permission request that isn't), subscribes
 * this browser to push, and registers the subscription with the server
 * against `orderId`. Returns false (never throws) on anything that didn't
 * work — permission denied, push not configured server-side, no service
 * worker support, etc. — so callers can just show/hide a button based on
 * the result without needing their own try/catch.
 */
export async function subscribeToPush(orderId: number): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch('/api/push');
      if (!res.ok) return false; // server-side push isn't configured yet
      const { publicKey } = await res.json();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const saveRes = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, subscription: sub.toJSON() }),
    });
    return saveRes.ok;
  } catch (err) {
    console.error('subscribeToPush failed:', err);
    return false;
  }
}
