-- ============================================================================
--  TRIANGLE · Customer self-cancellation — migration v16 (idempotent)
--  Run AFTER migration_v15_driver_online_status.sql.
--
--  Adds what's needed for a customer to cancel their own order within the
--  5-minute / PENDING window from the order tracker (no login required —
--  authenticated the same way the tracker itself is, via ?order_token=).
--
--  Design note: we deliberately do NOT introduce a new `order_status` enum
--  value (e.g. 'cancelled_by_customer'). The existing 'cancelled' status
--  already drives stock-restore, table-release and push-notification side
--  effects across api/orders.js and api/driver-orders.js, and the delivery
--  guard trigger (guard_delivery_transition, schema_driver_dashboard_v3.sql)
--  already branches on `cancel_reason` being set. Adding a new enum value
--  would mean re-auditing every one of those call sites (plus RLS, the
--  front-end OrderStatus union, and every place that filters status =
--  'cancelled') for a purely cosmetic distinction. Instead we reuse
--  `cancel_reason` (already added in migration_v13, currently used for
--  driver cancellations) and add a small `cancelled_by` discriminator so
--  the app can tell customer/driver/staff cancellations apart without
--  touching the state machine.
-- ============================================================================

begin;

alter table public.orders
  add column if not exists cancelled_by text;

alter table public.orders
  drop constraint if exists orders_cancelled_by_check;

alter table public.orders
  add constraint orders_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('customer', 'driver', 'staff'));

comment on column public.orders.cancelled_by is
  'Who cancelled the order: ''customer'' (self-service, within the 5-minute PENDING window), ''driver'' (mid-route abandon — see cancel_reason), ''staff'' (admin/kitchen/cashier), or null for orders that were never cancelled or predate this column. Independent of the order_status enum, which keeps a single ''cancelled'' terminal value for every case.';

create index if not exists idx_orders_cancelled_by
  on public.orders (cancelled_by)
  where cancelled_by is not null;

commit;
