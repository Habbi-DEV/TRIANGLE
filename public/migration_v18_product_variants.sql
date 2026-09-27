-- ============================================================================
--  TRIANGLE · Migration v18 — Product variants (sizes/formats), for Drinks
--  and any other product that comes in more than one size or format.
--
--  Run in the Supabase SQL Editor AFTER migration_v17_logo_light_dark.sql
--  has been applied.
--
--  WHY A NEW TABLE (and not reusing sauces/supplements):
--  Sauces and supplements are a shared catalog: one "Ketchup" row can be
--  offered on many products, added on top of the base price, several at
--  once. A variant is the opposite shape — it belongs to exactly one
--  product, replaces the base price (a 33cl Coke IS 2.00, not "product
--  price + 2.00"), and only one can be selected at a time (you pick a
--  size, not a combination of sizes). So variants follow the same model
--  as product_images (owned rows under one product_id, not a shared
--  catalog joined through a link table) rather than the sauces model.
--
--  Drinks themselves need NO new system: they are ordinary rows in
--  public.products under whichever category the restaurant names for
--  them (e.g. "Boissons" / "المشروبات"), created from the existing
--  admin "New product" form — see api/categories.js / MenuManagePage.
--  A drink with a single price needs no variant row at all; this table
--  is only for the ones that come in more than one size/format.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. PRODUCT_VARIANTS — optional size/format rows under a product.
--    Example (Coca-Cola): ("Can 33cl", 2.00), ("Bottle 1L", 4.00).
--    is_available mirrors products.is_available: hides one size without
--    deleting it (e.g. temporarily out of 1L bottles but cans are fine).
-- ----------------------------------------------------------------------------
create table public.product_variants (
  id           bigint generated always as identity primary key,
  product_id   bigint not null references public.products (id) on delete cascade,
  name         text not null,
  price        numeric(10,2) not null check (price >= 0),
  is_available boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint product_variants_name_len check (char_length(name) between 1 and 80),
  constraint product_variants_unique_name_per_product unique (product_id, name)
);
comment on table public.product_variants is 'Optional size/format rows for a product (e.g. Can 33cl vs Bottle 1L on a drink). The variant''s own price replaces the product''s base price when one is chosen — it is not added on top.';

create index idx_product_variants_product on public.product_variants (product_id, sort_order);

create trigger trg_product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

alter table public.product_variants enable row level security;
create policy "product_variants_public_read" on public.product_variants for select using (true);
create policy "product_variants_staff_write" on public.product_variants
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 2. ORDER ITEM VARIANT SNAPSHOT — immutable, same spirit as product_name /
--    sauces / supplements: never a live FK read for display, so a later
--    rename/price change/deletion of the variant can't rewrite history.
--    variant_id itself IS kept (unlike sauces/supplements' pure jsonb
--    snapshot) so a report can still group by "which size sold", but
--    ON DELETE SET NULL means deleting a variant never blocks deleting it
--    from the catalog and never touches past totals (unit_price already
--    folds the variant's price in at order time).
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column variant_id   bigint references public.product_variants (id) on delete set null,
  add column variant_name text;
comment on column public.order_items.variant_name is 'Snapshot of the chosen variant''s name at order time (e.g. "Bottle 1L"), independent of the live product_variants row.';

commit;

-- ============================================================================
-- DONE. Next steps:
--   · No category or product changes needed to start selling drinks — add
--     a "Boissons"/"المشروبات" category and products from the existing
--     admin Menu screen, exactly like any other item.
--   · Only add variant rows (from the product's own edit modal → Sizes)
--     for the products that actually come in more than one size.
-- ============================================================================
