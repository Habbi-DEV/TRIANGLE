-- ============================================================================
--  TRIANGLE · Migration v19 — photo per size/variant (e.g. a can vs a bottle
--  photo for the same drink), so the size picker can show a picture instead
--  of plain text, same idea as the sauce/supplement swatches.
--
--  Run in the Supabase SQL Editor AFTER migration_v18_product_variants.sql.
-- ============================================================================

begin;

alter table public.product_variants
  add column image_url text;
comment on column public.product_variants.image_url is 'Optional photo for this size/format (ideally a transparent PNG, same as sauces/supplements) — falls back to a generic icon in the UI when empty.';

commit;
