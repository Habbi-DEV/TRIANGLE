-- ============================================================================
--  TRIANGLE · Driver Dashboard — migration v3 (idempotent — safe to re-run)
--  Run AFTER schema.sql. Safe to run even if v1/v2 of this migration were
--  already applied (everything below is guarded / IF NOT EXISTS / replaces
--  cleanly). This version adds one thing on top of v2: a DB-level trigger
--  that makes the driver-assignment state machine impossible to corrupt,
--  even by a future bug or a manual SQL edit — not just by the API layer.
--
--  TABLE OF CONTENTS
--    1. delivery_status ENUM
--    2. orders columns ............... driver_id, delivery_status, delivered_at
--    3. Indexes
--    4. Transition guard trigger ..... replaces the old reset-only trigger:
--                                       - cancelling always frees the order
--                                       - driver_id can't be swapped from
--                                         one driver straight to another
--                                       - delivery_status can't move backward
--    5. RLS (restrictive) ............ scopes delivery_driver role to only
--                                       unassigned orders + their own
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. DELIVERY_STATUS ENUM
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'delivery_status') then
    create type public.delivery_status as enum
      ('unassigned', 'accepted', 'picked_up', 'on_the_way', 'delivered');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. ORDERS — new columns
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists driver_id       uuid references public.profiles (id) on delete set null,
  add column if not exists delivery_status public.delivery_status not null default 'unassigned',
  add column if not exists delivered_at    timestamptz;

comment on column public.orders.driver_id is
  'Delivery driver (profiles.role = delivery_driver) assigned to this order. Null = unassigned / not a delivery order.';
comment on column public.orders.delivery_status is
  'Driver-facing sub-status, independent of orders.status. Meaningful only when order_type = delivery.';

-- ----------------------------------------------------------------------------
-- 3. INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_orders_driver_id on public.orders (driver_id) where driver_id is not null;

create index if not exists idx_orders_delivery_available on public.orders (created_at)
  where order_type = 'delivery' and status = 'ready' and driver_id is null;

create index if not exists idx_orders_delivery_mine on public.orders (driver_id, created_at desc)
  where order_type = 'delivery' and driver_id is not null;

-- ----------------------------------------------------------------------------
-- 4. TRANSITION GUARD — defense-in-depth state machine enforcement
-- ----------------------------------------------------------------------------
-- api/driver-orders.js already enforces this with an atomic conditional
-- UPDATE (…WHERE delivery_status = <expected current state>…), which is
-- what actually prevents two drivers from both accepting the same order —
-- Postgres serializes concurrent UPDATEs on the same row, so only one can
-- ever match that WHERE clause. This trigger is a second, independent line
-- of defense at the database layer itself: even a future bug in the API
-- code, an admin running a manual UPDATE, or a different code path added
-- later cannot silently corrupt the state machine.
drop trigger if exists trg_orders_reset_delivery on public.orders;
drop function if exists public.reset_delivery_on_cancel();

create or replace function public.guard_delivery_transition()
returns trigger language plpgsql as $$
declare
  rank jsonb := '{"unassigned":0,"accepted":1,"picked_up":2,"on_the_way":3,"delivered":4}'::jsonb;
begin
  -- Cancelling always frees the order back up, regardless of who held it —
  -- otherwise a cancelled order could stay permanently "claimed" by a
  -- driver with no way for them to ever resolve it.
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.driver_id := null;
    new.delivery_status := 'unassigned';
    return new;
  end if;

  -- Once assigned, an order can only be freed (driver_id -> null) or left
  -- with the same driver — never handed from one driver straight to
  -- another. Reassignment must go through null first (i.e. a cancel or an
  -- explicit unassign), so two drivers can never simultaneously believe
  -- they hold the same delivery.
  if old.driver_id is not null and new.driver_id is not null
     and old.driver_id <> new.driver_id then
    raise exception
      'orders.driver_id cannot be reassigned directly from one driver to another (order %, % -> %)',
      new.id, old.driver_id, new.driver_id;
  end if;

  -- delivery_status only ever moves forward through the workflow while a
  -- driver holds the order. (Resetting to 'unassigned' happens either via
  -- the cancel branch above, or together with driver_id -> null, which
  -- this check allows since new.driver_id is null in that case.)
  if new.driver_id is not null
     and (rank ->> new.delivery_status::text)::int < (rank ->> old.delivery_status::text)::int then
    raise exception
      'orders.delivery_status cannot move backward (order %, % -> %)',
      new.id, old.delivery_status, new.delivery_status;
  end if;

  return new;
end $$;

drop trigger if exists trg_orders_delivery_guard on public.orders;
create trigger trg_orders_delivery_guard
  before update on public.orders
  for each row execute function public.guard_delivery_transition();

-- ----------------------------------------------------------------------------
-- 5. RLS — scope the delivery_driver role
-- ----------------------------------------------------------------------------
create or replace function public.is_driver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role() = 'delivery_driver';
$$;

drop policy if exists "orders_driver_scope_read" on public.orders;
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

drop policy if exists "orders_driver_scope_update" on public.orders;
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
