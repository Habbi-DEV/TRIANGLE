-- ============================================================================
-- Migration v15 — Driver online/offline status
-- ----------------------------------------------------------------------------
-- Adds a simple `is_online` toggle on profiles so a delivery driver can
-- control whether they show up for new deliveries, instead of always being
-- reachable the moment the app is open.
--
-- Deliberately just a boolean (no presence/heartbeat system): the driver
-- flips it by hand from the app header, and api/driver-orders.js's
-- GET ?scope=available refuses to hand back any unclaimed orders to a
-- driver whose own is_online is false. This is enough to stop *new* order
-- alerts/visibility while offline; it does not affect an order the driver
-- already holds (scope=mine), which must always remain visible so they can
-- finish a delivery in progress even after going offline.
--
-- Self-service: profiles already has an RLS policy
-- ("profiles_update_own", see schema.sql section 10.1) letting a user
-- update their own row, so the driver app flips this directly via the
-- Supabase client — no new API endpoint needed.
-- ============================================================================

alter table public.profiles
  add column if not exists is_online boolean not null default false;

comment on column public.profiles.is_online is
  'Delivery driver availability toggle (self-managed from the Driver Dashboard header). Only meaningful for role = delivery_driver; ignored for other roles.';

-- Reset to offline on every deploy of this migration so a driver who forgot
-- their tab open overnight doesn't wake up "online" without realizing it.
update public.profiles set is_online = false where role = 'delivery_driver';
