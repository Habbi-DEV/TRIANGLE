-- ============================================================================
--  RESTOLINK · Migration v9 — Algeria localization
--  · Removes VAT/tax entirely (not applicable in Algeria).
--  · Forces a single currency: Algerian Dinar (displayed as "Da" — see
--    src/lib/format.ts). The `currency` column and its EUR/USD/MAD/DZD
--    check constraint are dropped; there's nothing left to pick.
--  · Forces cash-only payments (no card/mobile in this market): orders now
--    default to `payment_method = 'cash'`, and payment_cash_enabled /
--    payment_card_enabled are dropped from `settings` — the app no longer
--    exposes a toggle since card is not offered at all.
--  · Adds `orders.delivery_fee`, a per-order snapshot of the delivery fee
--    that was actually charged (mirrors how `orders.tax_rate` used to be
--    snapshotted before this migration), and updates the order-totals
--    trigger to fold it into `total` instead of tax.
--
--  Run in the Supabase SQL Editor AFTER schema.sql and migration_v2..v8
--  have already been applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. ORDERS — drop tax columns, add a delivery_fee snapshot
-- ----------------------------------------------------------------------------
alter table public.orders add column if not exists delivery_fee numeric(10,2) not null default 0;

alter table public.orders drop column if exists tax_rate;
alter table public.orders drop column if exists tax_amount;

alter table public.orders alter column payment_method set default 'cash';
update public.orders set payment_method = 'cash' where payment_method <> 'cash';

-- ----------------------------------------------------------------------------
-- 2. SETTINGS — single currency (DZD/"Da"), no VAT, no card-payment toggle
-- ----------------------------------------------------------------------------
alter table public.settings drop constraint if exists settings_currency_check;
alter table public.settings drop column if exists currency;

alter table public.settings drop constraint if exists settings_tax_rate_check;
alter table public.settings drop column if exists tax_rate;

alter table public.settings drop column if exists payment_card_enabled;
alter table public.settings drop column if exists payment_cash_enabled;

-- ----------------------------------------------------------------------------
-- 3. ORDER MATH — recompute total from subtotal + delivery_fee (no tax)
-- ----------------------------------------------------------------------------
create or replace function public.recalc_order_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_order bigint := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
     set subtotal = coalesce(s.sum, 0),
         total    = round(coalesce(s.sum, 0) - o.discount + o.delivery_fee, 2)
    from (select order_id, sum(line_total) as sum
            from public.order_items
           where order_id = target_order
           group by order_id) s
   where o.id = target_order;

  update public.orders
     set subtotal = 0, total = delivery_fee
   where id = target_order
     and not exists (select 1 from public.order_items where order_id = target_order);

  return null;
end $$;

commit;

-- ============================================================================
-- DONE. Next steps:
--   · api/orders.js and api/settings.js already updated to match (no tax_rate,
--     no currency, cash-only) — no further app-code action needed.
--   · Every price in the UI now renders as "1 250.00 Da" (src/lib/format.ts).
--   · Existing orders keep their historical `total` as-is; only new
--     inserts/updates use the new (no-tax) math from here on.
-- ============================================================================
