-- migration_v21 — product badges + free-delivery threshold
-- Run this in the Supabase SQL editor BEFORE (or right after) deploying the
-- new menu design. Safe to re-run (idempotent). The app keeps working without
-- it — badges and the free-delivery bar simply stay hidden — but the admin
-- cannot save a badge / threshold until the columns exist.

-- 1. Badge shown on the product card in the customer menu.
--    NULL = no badge. Values: 'popular' | 'new' | 'limited'
alter table public.products
  add column if not exists badge text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_badge_check'
  ) then
    alter table public.products
      add constraint products_badge_check
      check (badge is null or badge in ('popular', 'new', 'limited'));
  end if;
end $$;

-- 2. Free delivery: when a delivery order's subtotal reaches this amount the
--    delivery fee is waived (server-side, in api/orders.js).
--    0 = feature off (default) — nothing changes until the owner sets a value.
alter table public.settings
  add column if not exists free_delivery_threshold numeric not null default 0;
