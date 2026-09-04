-- ============================================================================
--  TRIANGLE · Customer Web Push — migration v14 (idempotent — safe to re-run)
--  Run AFTER migration_v13_delivery_maps.sql.
--
--  Lets a customer receive a real OS-level push notification when their
--  order's status changes, even with the site fully closed (not just a
--  background tab) — unlike the in-page `new Notification()` alerts already
--  in MenuPage, which only fire while the tab's JS is alive.
--
--  There's no customer login, so a subscription is tied directly to the
--  order_id it was created for (see api/push-subscribe.js) rather than to a
--  user account. One browser can hold subscriptions for several orders
--  (endpoint is unique per browser+origin, order_id is not unique alone).
-- ============================================================================

begin;

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references public.orders(id) on delete cascade,
  endpoint   text   not null unique,
  p256dh     text   not null,
  auth       text   not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_order_id_idx
  on public.push_subscriptions (order_id);

comment on table public.push_subscriptions is
  'Web Push subscriptions for order-status alerts, one row per browser subscription. Written by api/push-subscribe.js (public, no auth — anyone can only ever push to the order_id they themselves subscribed for), read by api/_lib/push.js when an order''s status changes.';

alter table public.push_subscriptions enable row level security;

-- No client-side reads/writes via the Supabase JS client anywhere in this
-- app for this table — both push-subscribe.js and _lib/push.js go through
-- the service-role key in db-client.js, which bypasses RLS entirely. RLS is
-- enabled here purely as defense-in-depth in case that ever changes; no
-- policy is defined, so the anon/authenticated roles have zero access.

commit;
