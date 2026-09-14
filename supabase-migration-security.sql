-- TRIANGLE security hardening migration (run in Supabase SQL editor)
-- 1) Per-order secrets: access_token (customer tracking) + delivery_otp (delivery proof)
-- 2) Audit log table for all sensitive mutations
-- 3) Price/stock sanity checks

alter table public.orders add column if not exists access_token uuid default gen_random_uuid();
alter table public.orders add column if not exists delivery_otp text;
update public.orders set access_token = gen_random_uuid() where access_token is null;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  actor_id uuid,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb
);
alter table public.audit_logs enable row level security;
-- Only service_role (backend) writes/reads audit; no public policy = locked down.

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_price_nonneg') then
    alter table public.products add constraint products_price_nonneg check (price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_stock_nonneg') then
    alter table public.products add constraint products_stock_nonneg check (stock >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sauces_price_nonneg') then
    alter table public.sauces add constraint sauces_price_nonneg check (price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplements_price_nonneg') then
    alter table public.supplements add constraint supplements_price_nonneg check (price >= 0);
  end if;
end $$;

-- Recommended: shorten JWT expiry (Dashboard -> Auth -> JWT expiry: 3600s) + enable leaked-password protection.
