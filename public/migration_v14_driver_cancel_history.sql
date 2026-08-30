-- ============================================================================
--  TRIANGLE · Delivery Maps — migration v14 (idempotent — safe to re-run)
--  Run AFTER migration_v13_delivery_maps.sql.
--
--  guard_delivery_transition() (schema_driver_dashboard_v3.sql) always
--  clears orders.driver_id when status -> 'cancelled', so the order drops
--  out of the driver's own "mine" list (api/driver-orders.js) the instant
--  it's cancelled — which is right for an admin/kitchen cancellation (the
--  point there really was to free it up), but wrong for a cancellation the
--  driver themselves just made (api/driver-orders.js's 'cancel' action,
--  which always sets cancel_reason): a cancelled order is terminal, never
--  reassigned, so there's no correctness reason to strip driver_id, and
--  doing so makes it vanish from that driver's own "recent" history right
--  as it happens.
--
--  Fix: only clear driver_id/delivery_status on cancel when cancel_reason
--  is NOT set (i.e. an admin/kitchen cancel) — a driver-cancel (which
--  always sets cancel_reason) now keeps driver_id, so it stays visible in
--  that driver's own list, correctly separated out of "active" by its
--  status = 'cancelled'.
-- ============================================================================

begin;

create or replace function public.guard_delivery_transition()
returns trigger language plpgsql as $$
declare
  rank jsonb := '{"unassigned":0,"accepted":1,"picked_up":2,"on_the_way":3,"delivered":4}'::jsonb;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.cancel_reason is null then
      new.driver_id := null;
      new.delivery_status := 'unassigned';
    end if;
    return new;
  end if;

  if old.driver_id is not null and new.driver_id is not null
     and old.driver_id <> new.driver_id then
    raise exception
      'orders.driver_id cannot be reassigned directly from one driver to another (order %, % -> %)',
      new.id, old.driver_id, new.driver_id;
  end if;

  if new.driver_id is not null
     and (rank ->> new.delivery_status::text)::int < (rank ->> old.delivery_status::text)::int then
    raise exception
      'orders.delivery_status cannot move backward (order %, % -> %)',
      new.id, old.delivery_status, new.delivery_status;
  end if;

  return new;
end $$;

commit;
