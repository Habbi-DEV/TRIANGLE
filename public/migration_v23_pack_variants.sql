-- ============================================================================
--  TRIANGLE · Migration v23 — Packs : choisir la TAILLE d'un produit
--
--  Un produit avec tailles (ex. Coca 33cl / 1L, prix différents) peut
--  maintenant entrer dans un pack avec une taille précise. Le même produit
--  peut aussi apparaître plusieurs fois avec des tailles différentes.
--
--  À exécuter APRÈS migration_v22_packs.sql. Idempotent.
--  Pour annuler : migration_v23_pack_variants_ROLLBACK.sql
-- ============================================================================

begin;

alter table public.pack_items
  add column if not exists variant_id bigint
  references public.product_variants (id) on delete restrict;

-- Avant : un seul exemplaire d'un produit par pack. Maintenant : un seul par
-- (produit + taille).
alter table public.pack_items drop constraint if exists pack_items_unique;
create unique index if not exists pack_items_unique_line
  on public.pack_items (pack_id, product_id, coalesce(variant_id, 0));

commit;
