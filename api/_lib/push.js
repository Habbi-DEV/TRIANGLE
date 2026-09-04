import webpush from 'web-push';
import supabase from './db-client.js';

// ----------------------------------------------------------------------------
// Web Push (customer order-status alerts) — real OS-level notifications that
// reach the customer even with the site fully closed, unlike the in-page
// `new Notification()` calls in MenuPage.tsx (those need the tab's JS to
// still be running). This is the server-side half: MenuPage subscribes the
// browser via /api/push (POST), and api/orders.js calls sendPushToOrder()
// below whenever a subscribed order's status changes.
//
// Requires three env vars (Vercel dashboard → Settings → Environment
// Variables), generated once with `npx web-push generate-vapid-keys`:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com
//   or https://yourdomain — required by the push spec so a push service can
//   contact you about a misbehaving sender; doesn't need to be a real inbox).
// ----------------------------------------------------------------------------

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // Not set up yet — fail soft. Order status updates must keep working
    // even if push was never configured; this just means no push goes out.
    console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — skipping push send.');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:contact@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

/**
 * Sends `payload` (plain object — arrives as event.data.json() in
 * public/push-sw.js) to every browser currently subscribed to this order.
 * Best-effort per subscription: one dead endpoint (customer revoked
 * permission, cleared site data, etc.) never blocks the others, and is
 * deleted on the spot (410/404 means the push service will never accept
 * that endpoint again) so it stops being retried on every future status
 * change for this order.
 */
export async function sendPushToOrder(orderId, payload) {
  if (!ensureConfigured()) return;

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('order_id', orderId);
  if (error) {
    console.error('[push] failed to load subscriptions:', error);
    return;
  }
  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error(`[push] send failed for subscription ${s.id}:`, err.message || err);
        }
      }
    })
  );
}
