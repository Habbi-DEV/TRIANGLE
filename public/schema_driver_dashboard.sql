-- ============================================================================
--  TRIANGLE · Driver Dashboard — migration
--  Adds driver assignment + granular delivery tracking on top of schema.sql.
--  Run in the Supabase SQL Editor (Dashboard → SQL) AFTER schema.sql.
--
--  TABLE OF CONTENTS
--    1. delivery_status ENUM ......... driver-facing sub-status of an order
--    2. orders columns ............... driver_id, delivery_status, delivered_at
--    3. Indexes ....................... available-orders feed + "my deliveries"
--    4. Auto-reset trigger ........... keeps delivery_status honest if an
--                                       order's main status/type changes
--    5. RLS (restrictive) ............ scopes delivery_driver role to only
--                                       unassigned orders + their own
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. DELIVERY_STATUS ENUM
-- ----------------------------------------------------------------------------
-- Separate from public.order_status (which drives the kitchen/cashier
-- board). delivery_status is the driver's own granular workflow:
--   unassigned → accepted → picked_up → on_the_way → delivered
create type public.delivery_status as enum
  ('unassigned', 'accepted', 'picked_up', 'on_the_way', 'delivered');

-- ----------------------------------------------------------------------------
-- 2. ORDERS — new columns
-- ----------------------------------------------------------------------------
alter table public.orders
  add column driver_id       uuid references public.profiles (id) on delete set null,
  add column delivery_status public.delivery_status not null default 'unassigned',
  add column delivered_at    timestamptz;

comment on column public.orders.driver_id is
  'Delivery driver (profiles.role = delivery_driver) assigned to this order. Null = unassigned / not a delivery order.';
comment on column public.orders.delivery_status is
  'Driver-facing sub-status, independent of orders.status. Meaningful only when order_type = delivery.';

-- ----------------------------------------------------------------------------
-- 3. INDEXES — "available near me" feed + "my active delivery" lookup
-- ----------------------------------------------------------------------------
create index idx_orders_driver_id on public.orders (driver_id) where driver_id is not null;

create index idx_orders_delivery_available on public.orders (created_at)
  where order_type = 'delivery' and status = 'ready' and driver_id is null;

create index idx_orders_delivery_mine on public.orders (driver_id, created_at desc)
  where order_type = 'delivery' and driver_id is not null;

-- ----------------------------------------------------------------------------
-- 4. AUTO-RESET — a cancelled/edited order can't stay "claimed" by a driver
-- ----------------------------------------------------------------------------
-- If an order is cancelled after a driver accepted it, or an admin manually
-- reverts its main status, free it back up instead of leaving a phantom
-- assignment a driver can never resolve from their own screen.
create or replace function public.reset_delivery_on_cancel()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.driver_id := null;
    new.delivery_status := 'unassigned';
  end if;
  return new;
end $$;

create trigger trg_orders_reset_delivery
  before update on public.orders
  for each row execute function public.reset_delivery_on_cancel();

-- ----------------------------------------------------------------------------
-- 5. RLS — scope the delivery_driver role
-- ----------------------------------------------------------------------------
-- The API layer (api/driver-orders.js) uses the Supabase service-role key,
-- so it always bypasses RLS — these policies exist for defense-in-depth and,
-- importantly, for the client-side Realtime subscription (useDriverOrders),
-- which connects as the driver's own authenticated user and is therefore
-- subject to RLS. Without this, a driver's realtime channel would receive
-- row-change events for every customer's delivery, not just unassigned
-- orders and their own — a data-exposure issue given customer_name /
-- customer_phone / delivery_address live on the same row.
--
-- Postgres ORs together multiple PERMISSIVE policies for the same command,
-- so simply adding a narrower policy wouldn't restrict the existing broad
-- "orders_staff_read" / "orders_staff_update" policies from schema.sql.
-- RESTRICTIVE policies are ANDed on top instead — exactly what's needed: no
-- effect on admin/cashier/kitchen, but they gate the delivery_driver role.

create or replace function public.is_driver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() = 'delivery_driver';
$$;

create policy "orders_driver_scope_read" on public.orders
  as restrictive
  for select
  using (
    not public.is_driver()
    or (
      order_type = 'delivery'
      and (
        (status = 'ready' and driver_id is null)
        or driver_id = auth.uid()
      )
    )
  );

create policy "orders_driver_scope_update" on public.orders
  as restrictive
  for update
  using (
    not public.is_driver()
    or (order_type = 'delivery' and (driver_id is null or driver_id = auth.uid()))
  )
  with check (
    not public.is_driver()
    or (order_type = 'delivery' and (driver_id is null or driver_id = auth.uid()))
  );

commit;
