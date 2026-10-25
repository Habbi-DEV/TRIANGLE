-- ============================================================================
--  TRIANGLE · ROLLBACK de la migration v22 (Packs)
--  À exécuter UNIQUEMENT si vous annulez la fonctionnalité Packs.
--  Utilisez avec le code « TRIANGLE-BEFORE-PACKS ».
--
--  ATTENTION : supprime les packs créés (les produits marqués pack) et le
--  contenu enregistré sur les anciennes commandes (colonne pack_contents).
--  Les commandes elles-mêmes sont conservées.
-- ============================================================================

begin;

alter table public.promotions   drop column if exists link_product_id;
alter table public.order_items  drop column if exists pack_contents;
drop table if exists public.pack_items;

-- Les packs n'existent plus : on retire les produits-packs (leurs lignes de
-- commande passées gardent leur nom grâce à product_name).
delete from public.products where is_pack = true;
alter table public.products drop column if exists is_pack;

commit;
