-- ============================================================================
--  RESTOLINK · Migration v4
--  Sauces were showing on every product, including drinks and desserts.
--  Adds a per-category switch so sauces only appear where they make sense.
--
--  Run in the Supabase SQL Editor AFTER migration_v3.sql has been applied.
-- ============================================================================

begin;

alter table public.categories
  add column allows_sauces boolean not null default true;
comment on column public.categories.allows_sauces is 'When false, products in this category never offer sauces on the product sheet (e.g. Drinks, Desserts).';

commit;

-- ============================================================================
-- After running this, go to Admin → Menu management → Categories and turn
-- off "Sauces" for Drinks / Desserts (or any other category where sauces
-- don't apply). Every category defaults to allowing sauces, so nothing
-- changes visually until you flip a category off.
-- ============================================================================