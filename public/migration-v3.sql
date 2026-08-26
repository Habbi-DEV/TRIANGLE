-- ============================================================================
--  RESTOLINK · Migration v3
--  Adds a photo per sauce, shown as a round swatch on the product sheet
--  instead of a plain text pill.
--
--  Run in the Supabase SQL Editor AFTER migration_v2.sql has been applied.
-- ============================================================================

begin;

alter table public.sauces
  add column image_url text;
comment on column public.sauces.image_url is 'Photo shown as a round swatch on the product sheet. Null falls back to a plain text pill.';

commit;