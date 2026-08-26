-- ============================================================================
--  RESTOLINK · Migration v2
--  Adds: (1) multi-image gallery per product, (2) sauces/extras catalog
--  with a visibility toggle, (3) sauce snapshot on order items.
--
--  Run in the Supabase SQL Editor AFTER schema.sql has already been applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. PRODUCT IMAGES — a product can now have several photos (gallery).
--    `products.image_url` stays as-is and is used as the cover photo shown
--    in grids/cards; rows here are the extra gallery photos shown on the
--    product detail sheet.
-- ----------------------------------------------------------------------------
create table public.product_images (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.product_images is 'Extra gallery photos for a product, in addition to the cover image_url.';

create index idx_product_images_product on public.product_images (product_id, sort_order);

alter table public.product_images enable row level security;

create policy "product_images_public_read" on public.product_images for select using (true);
create policy "product_images_staff_write" on public.product_images
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 2. SAUCES — optional add-ons customers can pick when ordering a product.
--    `is_active = false` hides a sauce from the e-menu / register without
--    deleting it (same pattern as categories.is_active).
-- ----------------------------------------------------------------------------
create table public.sauces (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  price      numeric(10,2) not null default 0 check (price >= 0),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sauces is 'Sauces / extras selectable on a product. Hidden (is_active=false) ones stay out of the e-menu.';

create trigger trg_sauces_updated_at
  before update on public.sauces
  for each row execute function public.set_updated_at();

alter table public.sauces enable row level security;

create policy "sauces_public_read"  on public.sauces for select using (true);
create policy "sauces_staff_write"  on public.sauces
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 3. ORDER ITEM SAUCES — immutable snapshot of the sauces chosen for a line,
--    same spirit as order_items.product_name / unit_price (never a live FK
--    join, so a later sauce rename/price change/deletion can't rewrite
--    history). unit_price on order_items already includes the sauces' price
--    at order time, so totals stay correct without touching the existing
--    generated line_total column.
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column sauces jsonb not null default '[]'::jsonb;
comment on column public.order_items.sauces is 'Snapshot of chosen sauces at order time: [{"name": "...", "price": 0.50}, ...]';

commit;

-- ============================================================================
-- DONE. Next steps:
--   · Create a public storage bucket named "menu-images" if you haven't
--     already (used by both the cover photo and the new gallery photos).
--   · Seed a few sauces from the admin "Menu management" page → Sauces.
-- ============================================================================
