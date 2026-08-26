-- ============================================================================
--  RESTOLINK · Migration v8
--  A photo for the "All" tile in the category rail. "All" isn't a real row
--  in public.categories (it's a synthetic UI-only entry that always shows
--  every product), so there was nowhere to attach an image to it — it
--  lives on settings instead, same idea as logo_url.
--
--  Run in the Supabase SQL Editor AFTER migration_v7.sql has been applied.
-- ============================================================================

begin;

alter table public.settings add column if not exists all_category_image_url text;
comment on column public.settings.all_category_image_url is 'Optional photo for the "All" tile in the e-menu category rail. Falls back to the ✨ emoji when null.';

commit;

-- ============================================================================
-- DONE. Nothing to backfill — starts null, so "All" keeps showing ✨ until
-- the admin uploads a photo for it (Categories section, admin Menu page).
-- ============================================================================
