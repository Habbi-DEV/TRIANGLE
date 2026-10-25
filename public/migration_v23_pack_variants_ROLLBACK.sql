-- ROLLBACK de la migration v23 (tailles dans les packs).
-- Si un même produit apparaît plusieurs fois dans un pack (tailles différentes),
-- on garde une seule ligne par produit avant de remettre la contrainte.
begin;

drop index if exists public.pack_items_unique_line;

delete from public.pack_items a
 using public.pack_items b
 where a.pack_id = b.pack_id and a.product_id = b.product_id and a.id > b.id;

alter table public.pack_items drop column if exists variant_id;
alter table public.pack_items
  add constraint pack_items_unique unique (pack_id, product_id);

commit;
