-- ============================================================================
--  TRIANGLE · Migration v22 — PACKS (offres groupées)
--
--  Un pack = un produit spécial (products.is_pack = true) avec son propre prix,
--  sa photo et son stock, plus la liste de ce qu'il contient (pack_items).
--  Le prix du pack est TOUJOURS lu en base par le serveur — jamais envoyé par
--  le client — comme pour tous les autres produits.
--
--  À exécuter dans le SQL Editor de Supabase. Idempotent (peut être relancé).
--  Pour TOUT ANNULER : exécuter  migration_v22_packs_ROLLBACK.sql
-- ============================================================================

begin;

-- 1. Un produit peut être un pack.
alter table public.products
  add column if not exists is_pack boolean not null default false;

-- 2. Contenu d'un pack : « 1 × Burger Classic, 1 × Frites, 1 × Coca ».
create table if not exists public.pack_items (
  id         bigint generated always as identity primary key,
  pack_id    bigint not null references public.products (id) on delete cascade,
  -- restrict : on ne peut pas supprimer un produit encore utilisé dans un pack
  -- (sinon le pack vendrait silencieusement moins que ce qu'il annonce).
  product_id bigint not null references public.products (id) on delete restrict,
  quantity   integer not null default 1 check (quantity between 1 and 20),
  constraint pack_items_unique unique (pack_id, product_id),
  constraint pack_items_not_self check (pack_id <> product_id)
);
create index if not exists idx_pack_items_pack on public.pack_items (pack_id);

-- Sécurité : RLS activé SANS aucune policy => la clé publique (anon) ne peut ni
-- lire ni écrire cette table. Seul le serveur (service role, via /api) y accède,
-- après avoir vérifié le rôle du personnel.
alter table public.pack_items enable row level security;

-- 3. Une bannière promo peut ouvrir un produit/pack au clic.
alter table public.promotions
  add column if not exists link_product_id bigint
  references public.products (id) on delete set null;

-- 4. Le contenu du pack est copié sur la ligne de commande : la cuisine et la
--    facture voient « 1× Burger, 1× Frites, 1× Coca » même si le pack change
--    plus tard.
alter table public.order_items
  add column if not exists pack_contents text;

commit;
