-- ============================================================================
--  RESTOLINK · Migration v7
--  Two additions for the e-menu's new top section:
--   1. categories.image_url — an optional photo for a category's square
--      icon (falls back to the existing emoji `icon` when not set).
--   2. public.promotions — the full-width promo/discount banner carousel
--      shown under the top bar, above the category rail. Admin-managed:
--      upload an image, order them, toggle one off without deleting it.
--
--  Run in the Supabase SQL Editor AFTER migration_v6.sql has been applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. CATEGORIES.IMAGE_URL — nullable, so every existing category keeps
--    showing its emoji exactly as before until the admin uploads a photo.
-- ----------------------------------------------------------------------------
alter table public.categories add column if not exists image_url text;
comment on column public.categories.image_url is 'Optional photo for the square category icon on the e-menu. Falls back to `icon` (emoji) when null.';

-- ----------------------------------------------------------------------------
-- 2. PROMOTIONS — banner images only (no title/subtitle fields): the
--    promotional text, discount %, etc. is baked into the uploaded image
--    itself, same as how a restaurant would design a poster. sort_order
--    controls carousel order; is_active hides one without deleting it,
--    same convention as sauces/supplements.
-- ----------------------------------------------------------------------------
create table public.promotions (
  id         bigint generated always as identity primary key,
  image_url  text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.promotions is 'Full-width promo/discount banner images shown in a carousel under the top bar on the e-menu, above the category rail.';

create trigger trg_promotions_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;

create policy "promotions_public_read" on public.promotions for select using (true);
create policy "promotions_staff_write" on public.promotions
  for all using (public.is_staff()) with check (public.is_staff());

commit;

-- ============================================================================
-- DONE. Nothing to backfill — image_url starts null on every category (the
-- emoji keeps showing), and promotions starts empty (no banner shows until
-- the admin uploads at least one).
-- ============================================================================
