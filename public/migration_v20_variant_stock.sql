-- ============================================================================
--  TRIANGLE · Migration v20 — Stock par taille/variante
--
--  À exécuter dans le SQL Editor de Supabase APRÈS v18 et v19.
--
--  Ce que ça fait :
--   1. Chaque taille (product_variants) a son propre stock.
--   2. Une vente d'une taille décrémente le stock de CETTE taille ; une vente
--      d'un produit sans taille décrémente toujours le stock du produit.
--   3. products.stock devient automatiquement la SOMME des stocks des tailles
--      disponibles (pour les produits qui ont des tailles) : la caisse, la
--      page Inventaire et les contrôles existants continuent de fonctionner.
--   4. L'annulation d'une commande restitue le stock par une fonction SQL
--      atomique (stock = stock + qty) et idempotente (jamais restitué 2 fois).
--   5. inventory_logs garde la trace de la taille concernée.
--
--  Les tailles déjà créées démarrent avec le stock actuel de leur produit
--  (point de départ) : corrigez-les ensuite dans l'admin.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. STOCK PAR TAILLE
-- ----------------------------------------------------------------------------
alter table public.product_variants
  add column stock integer not null default 0 check (stock >= 0);
comment on column public.product_variants.stock is 'Stock vendable de cette taille. products.stock = somme de ces valeurs (tailles disponibles) pour un produit qui a des tailles.';

-- Point de départ pour les tailles déjà existantes.
update public.product_variants v
   set stock = greatest(coalesce(p.stock, 0), 0)
  from public.products p
 where p.id = v.product_id;

-- ----------------------------------------------------------------------------
-- 2. TRAÇABILITÉ : quelle taille a bougé
-- ----------------------------------------------------------------------------
alter table public.inventory_logs
  add column variant_id bigint references public.product_variants (id) on delete set null;
create index idx_inventory_logs_variant on public.inventory_logs (variant_id);

-- ----------------------------------------------------------------------------
-- 3. IDEMPOTENCE DE LA RESTITUTION (une commande n'est restituée qu'une fois)
-- ----------------------------------------------------------------------------
alter table public.orders
  add column stock_restored_at timestamptz;
comment on column public.orders.stock_restored_at is 'Renseigné quand le stock d''une commande annulée a été restitué — empêche une double restitution.';

-- ----------------------------------------------------------------------------
-- 4. products.stock = SOMME des tailles disponibles
--    (uniquement pour les produits qui ont au moins une taille)
-- ----------------------------------------------------------------------------
create or replace function public.sync_product_stock_from_variants()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid bigint;
begin
  if tg_op = 'DELETE' then
    pid := old.product_id;
  else
    pid := new.product_id;
  end if;

  update public.products
     set stock = coalesce((
           select sum(v.stock)
             from public.product_variants v
            where v.product_id = pid and v.is_available
         ), 0)
   where id = pid
     and exists (select 1 from public.product_variants v where v.product_id = pid);
  return null;
end $$;

create trigger trg_product_variants_sync_stock
  after insert or delete or update of stock, is_available on public.product_variants
  for each row execute function public.sync_product_stock_from_variants();

revoke execute on function public.sync_product_stock_from_variants() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. VENTE : décrémente la taille choisie, sinon le produit (comportement d'origine)
-- ----------------------------------------------------------------------------
create or replace function public.decrement_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is null then
    return null;
  end if;

  if new.variant_id is not null then
    update public.product_variants
       set stock = greatest(stock - new.quantity, 0)
     where id = new.variant_id;

    insert into public.inventory_logs (product_id, variant_id, change, reason, notes)
    values (new.product_id, new.variant_id, -new.quantity, 'sale',
            'Sold in order #' || (1000 + new.order_id));
  else
    update public.products
       set stock = greatest(stock - new.quantity, 0)
     where id = new.product_id;

    insert into public.inventory_logs (product_id, change, reason, notes)
    values (new.product_id, -new.quantity, 'sale',
            'Sold in order #' || (1000 + new.order_id));
  end if;
  return null;
end $$;

-- ----------------------------------------------------------------------------
-- 6. ANNULATION : restitution atomique + idempotente
--    Retourne true si le stock a été restitué, false s'il l'avait déjà été.
-- ----------------------------------------------------------------------------
create or replace function public.restore_order_stock(p_order_id bigint, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r record;
  claimed bigint;
begin
  -- "Réclame" la commande : une seule exécution gagne, même en cas d'appels simultanés.
  update public.orders
     set stock_restored_at = now()
   where id = p_order_id and stock_restored_at is null
  returning id into claimed;

  if claimed is null then
    return false;
  end if;

  for r in
    select product_id, variant_id, quantity
      from public.order_items
     where order_id = p_order_id and product_id is not null
  loop
    if r.variant_id is not null then
      update public.product_variants set stock = stock + r.quantity where id = r.variant_id;
      insert into public.inventory_logs (product_id, variant_id, change, reason, notes)
      values (r.product_id, r.variant_id, r.quantity, 'correction',
              coalesce(p_note, 'Order #' || (1000 + p_order_id) || ' cancelled — stock restored'));
    else
      update public.products set stock = stock + r.quantity where id = r.product_id;
      insert into public.inventory_logs (product_id, change, reason, notes)
      values (r.product_id, r.quantity, 'correction',
              coalesce(p_note, 'Order #' || (1000 + p_order_id) || ' cancelled — stock restored'));
    end if;
  end loop;

  return true;
end $$;

-- Appelable uniquement par le backend (clé service-role), jamais depuis le navigateur.
revoke execute on function public.restore_order_stock(bigint, text) from public, anon, authenticated;
grant  execute on function public.restore_order_stock(bigint, text) to service_role;

-- ----------------------------------------------------------------------------
-- 7. SYNCHRO INITIALE : products.stock = somme des tailles pour les produits existants
-- ----------------------------------------------------------------------------
update public.products p
   set stock = coalesce((
         select sum(v.stock) from public.product_variants v
          where v.product_id = p.id and v.is_available
       ), 0)
 where exists (select 1 from public.product_variants v where v.product_id = p.id);

commit;

-- ============================================================================
-- TERMINÉ. Ensuite : ouvrez chaque produit à tailles dans l'admin (Menu) et
-- saisissez le vrai stock de chaque taille.
-- ============================================================================
