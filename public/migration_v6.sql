-- ============================================================================
--  RESTOLINK · Migration v6
--  Gives Sauces the same per-product flexibility as Supplements: which
--  products offer which sauce is now chosen per-product by the admin (New/
--  Edit product modal), instead of being gated by the category's
--  `allows_sauces` flag (migration_v4). That flag is dropped as part of
--  this migration since it's fully superseded.
--
--  Run in the Supabase SQL Editor AFTER migration_v5.sql has been applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. PRODUCT_SAUCES — which sauces the admin picked for a given product.
--    Exact mirror of public.product_supplements (migration_v5): composite
--    PK, ON DELETE CASCADE both ways so deleting a product or a sauce
--    cleans up the link automatically.
-- ----------------------------------------------------------------------------
create table public.product_sauces (
  product_id bigint not null references public.products (id) on delete cascade,
  sauce_id   bigint not null references public.sauces (id) on delete cascade,
  primary key (product_id, sauce_id)
);
comment on table public.product_sauces is 'Per-product opt-in: which sauces the admin chose to offer on this specific product (New/Edit product modal), independent of category — same model as product_supplements.';

create index idx_product_sauces_sauce on public.product_sauces (sauce_id);

alter table public.product_sauces enable row level security;

create policy "product_sauces_public_read" on public.product_sauces for select using (true);
create policy "product_sauces_staff_write" on public.product_sauces
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 2. SEED product_sauces from current eligibility, so the switch to
--    per-product doesn't silently hide every sauce on go-live: every
--    product whose category currently allows sauces (or has no category —
--    same "defaults to eligible" rule the e-menu used) gets linked to
--    every sauce, active or not, matching today's effective behavior.
--    From here the admin fine-tunes per-product, same as supplements.
-- ----------------------------------------------------------------------------
insert into public.product_sauces (product_id, sauce_id)
select p.id, s.id
from public.products p
cross join public.sauces s
left join public.categories c on c.id = p.category_id
where coalesce(c.allows_sauces, true) = true
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 3. DROP categories.allows_sauces — superseded by product_sauces above.
--    Every category used to gate sauces on/off for all its products at
--    once; now each product opts in individually, exactly like
--    supplements, so the column (and its UI toggle) has no reader left.
-- ----------------------------------------------------------------------------
alter table public.categories drop column if exists allows_sauces;

commit;

-- ============================================================================
-- DONE. Next steps:
--   · Nothing changes on the e-menu right after this runs — every product
--     that used to show sauces still shows the same sauces, just linked
--     per-product now instead of via its category.
--   · Open a product (New/Edit) → Sauces to fine-tune which sauces it
--     offers, exactly like Supplements. New products start with none
--     attached, same as Supplements.
--   · The register and order snapshots need no other changes: they already
--     treat sauces exactly like supplements (client-sent sauce_ids trusted
--     at checkout, immutable name/price snapshot on order_items).
-- ============================================================================
