-- ============================================================================
--  TRIANGLE · Delivery Maps — migration v13 (idempotent — safe to re-run)
--  Run AFTER schema_driver_dashboard_v3.sql.
--
--  Adds what's needed for:
--    1. The customer picking their delivery location on a map at checkout
--       (orders.delivery_lat / delivery_lng).
--    2. The driver cancelling a delivery mid-route (e.g. customer doesn't
--       answer / isn't there) with a recorded reason
--       (orders.cancel_reason).
-- ============================================================================

begin;

alter table public.orders
  add column if not exists delivery_lat  double precision,
  add column if not exists delivery_lng  double precision,
  add column if not exists cancel_reason text;

comment on column public.orders.delivery_lat is
  'Latitude picked by the customer on the checkout map, or reverse-geocoded from it. Null when the customer only typed a text address.';
comment on column public.orders.delivery_lng is
  'Longitude picked by the customer on the checkout map. Null when the customer only typed a text address.';
comment on column public.orders.cancel_reason is
  'Free-text reason recorded when an order is cancelled by a driver (e.g. customer unreachable / refused) — null for admin/kitchen cancellations.';

commit;
