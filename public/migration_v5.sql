-- ============================================================================
--  RESTOLINK · Migration v5
--  Adds "Supplements": optional paid add-ons like Sauces (photo swatch,
--  selectable circle, extra price), but assigned per-product by the admin
--  from inside the New/Edit product modal instead of per-category.
--
--  Run in the Supabase SQL Editor AFTER migration_v4.sql has been applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. SUPPLEMENTS — same shape as public.sauces (name, price, visibility
--    toggle, sort order, optional photo). A separate table (rather than
--    reusing `sauces` with a type column) keeps the DB model simple; the
--    API layer is what multiplexes both tables behind one endpoint.
-- ----------------------------------------------------------------------------
create table public.supplements (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  price      numeric(10,2) not null default 0 check (price >= 0),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.supplements is 'Paid add-ons (double cheese, extra meat, kofta, double chicken, ...). Unlike sauces, which product offers which supplement is chosen per-product by the admin (see product_supplements), not by category.';

create trigger trg_supplements_updated_at
  before update on public.supplements
  for each row execute function public.set_updated_at();

alter table public.supplements enable row level security;

create policy "supplements_public_read" on public.supplements for select using (true);
create policy "supplements_staff_write" on public.supplements
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 2. PRODUCT_SUPPLEMENTS — which supplements the admin picked for a given
--    product. Composite PK (no surrogate id needed, a product either offers
--    a supplement or it doesn't). ON DELETE CASCADE both ways so deleting a
--    product or a supplement cleans up the link automatically.
-- ----------------------------------------------------------------------------
create table public.product_supplements (
  product_id    bigint not null references public.products (id) on delete cascade,
  supplement_id bigint not null references public.supplements (id) on delete cascade,
  primary key (product_id, supplement_id)
);
comment on table public.product_supplements is 'Per-product opt-in: which supplements the admin chose to offer on this specific product (New/Edit product modal), independent of category.';

create index idx_product_supplements_supplement on public.product_supplements (supplement_id);

alter table public.product_supplements enable row level security;

create policy "product_supplements_public_read" on public.product_supplements for select using (true);
create policy "product_supplements_staff_write" on public.product_supplements
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 3. ORDER ITEM SUPPLEMENTS SNAPSHOT — immutable, same spirit as
--    order_items.sauces (never a live FK join, so a later supplement
--    rename/price change/deletion can't rewrite history). unit_price on
--    order_items already folds in the chosen supplements' price at order
--    time, so totals stay correct without touching line_total.
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column supplements jsonb not null default '[]'::jsonb;
comment on column public.order_items.supplements is 'Snapshot of chosen supplements at order time: [{"name": "...", "price": 1.00}, ...]';

commit;

-- ============================================================================
-- DONE. Next steps:
--   · Seed a few supplements from the admin "Menu management" page →
--     Supplements (e.g. Double Cheese, Extra Meat, Kofta, Double Chicken).
--   · Open a product (New/Edit) and toggle which supplements it offers —
--     nothing shows on the e-menu until a supplement is both active AND
--     attached to that product.
-- ============================================================================
