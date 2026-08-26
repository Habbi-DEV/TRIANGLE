-- ============================================================================
--  RESTOLINK · Cloud-native POS & Restaurant Management System
--  Supabase (PostgreSQL) migration — schema.sql  (production grade)
-- ============================================================================
--  Run in the Supabase SQL Editor (Dashboard → SQL) or via `supabase db push`.
--
--  TABLE OF CONTENTS
--    1.  ENUM types ................. order lifecycle + RBAC vocabulary
--    2.  Tables ..................... profiles, categories, products, tables,
--                                     orders, order_items, inventory_logs
--    3.  Indexes .................... tuned for realtime feeds & POS filters
--    4.  updated_at ................. generic timestamp trigger
--    5.  Order math ................. auto subtotal / delivery fee / total recalc
--    6.  Order validation ........... per-order-type field enforcement
--                                     (dine_in → table_number,
--                                      delivery → name + phone + address)
--    7.  Table occupancy ............ dine-in orders drive table status
--    8.  Stock ...................... order items decrement product stock
--    9.  Auth bootstrap ............. auto profile row on auth.users signup
--    10. RLS ........................ enabled everywhere + role policies
--    11. Realtime ................... orders + order_items published
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------
-- Central vocabulary for the whole system. Using ENUMs (instead of free text)
-- guarantees that the POS, the kitchen screen and the e-menu can never
-- disagree about what a status/type/role means.

create type public.user_role as enum
  ('admin', 'cashier', 'kitchen', 'delivery_driver');

create type public.order_type as enum
  ('dine_in', 'takeaway', 'delivery');

create type public.order_status as enum
  ('pending', 'confirmed', 'preparing', 'ready',
   'out_for_delivery', 'completed', 'cancelled');

create type public.table_status as enum
  ('available', 'occupied', 'reserved', 'cleaning');

create type public.payment_method as enum
  ('cash', 'card', 'mobile');

create type public.inventory_reason as enum
  ('initial', 'restock', 'sale', 'waste', 'correction');

-- ----------------------------------------------------------------------------
-- 2. TABLES
-- ----------------------------------------------------------------------------

-- 2.1 profiles — 1:1 mirror of auth.users, enriched with the staff role.
--     Created automatically by the handle_new_user() trigger (section 9).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  avatar_url text,
  role       public.user_role not null default 'cashier',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Staff identities + RBAC roles (admin, cashier, kitchen, delivery_driver).';

-- 2.2 categories — menu sections shown in the e-menu & POS product grid.
create table public.categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  icon       text not null default '🍽️',
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.3 products — sellable items. price/tax are numeric(10,2): never float.
create table public.products (
  id           bigint generated always as identity primary key,
  category_id  bigint references public.categories (id) on delete set null,
  name         text not null,
  description  text not null default '',
  price        numeric(10,2) not null check (price >= 0),
  image_url    text not null default '',
  is_available boolean not null default true,
  stock        integer not null default 0 check (stock >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2.4 tables — physical restaurant tables addressed by dine-in orders.
create table public.tables (
  id           bigint generated always as identity primary key,
  table_number integer not null unique check (table_number > 0),
  seats        integer not null default 2 check (seats > 0),
  status       public.table_status not null default 'available',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2.5 orders — the heart of the POS. Conditional fields are enforced by the
--     validate_order_fields() trigger (section 6), not by app code alone.
create table public.orders (
  id               bigint generated always as identity primary key,
  order_type       public.order_type not null,
  status           public.order_status not null default 'pending',
  -- dine_in only:
  table_number     integer,
  -- delivery only:
  customer_name    text,
  customer_phone   text,
  delivery_address text,
  notes            text,
  subtotal         numeric(10,2) not null default 0,
  discount         numeric(10,2) not null default 0,
  -- Snapshot of settings.delivery_fee at order time (0 unless order_type
  -- is 'delivery'). No VAT/tax in this build — not applicable in Algeria.
  delivery_fee     numeric(10,2) not null default 0,
  total            numeric(10,2) not null default 0,
  payment_method   public.payment_method not null default 'cash',
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.orders is 'Every sale (dine_in / takeaway / delivery). Totals are maintained by triggers.';

-- 2.6 order_items — immutable snapshot of what was sold (name + unit price).
--     line_total is a generated column: quantity × unit_price, always exact.
create table public.order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders (id) on delete cascade,
  product_id   bigint references public.products (id) on delete set null,
  product_name text not null,
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity > 0),
  line_total   numeric(10,2) generated always as (unit_price * quantity) stored,
  created_at   timestamptz not null default now()
);

-- 2.7 inventory_logs — full audit trail of every stock movement.
create table public.inventory_logs (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  change     integer not null,                    -- + restock / − waste / sale
  reason     public.inventory_reason not null default 'correction',
  notes      text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. INDEXES — realtime order feed & POS filters must stay O(log n)
-- ----------------------------------------------------------------------------
create index idx_orders_status          on public.orders (status);
create index idx_orders_order_type      on public.orders (order_type);
create index idx_orders_created_at_desc on public.orders (created_at desc);
create index idx_orders_status_created  on public.orders (status, created_at desc);
create index idx_orders_table_number    on public.orders (table_number) where table_number is not null;
create index idx_order_items_order_id   on public.order_items (order_id);
create index idx_order_items_product_id on public.order_items (product_id);
create index idx_products_category_id   on public.products (category_id);
create index idx_products_available     on public.products (is_available) where is_available;
create index idx_inventory_logs_product on public.inventory_logs (product_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. GENERIC updated_at TRIGGER
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_profiles_updated   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger trg_categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger trg_products_updated   before update on public.products   for each row execute function public.set_updated_at();
create trigger trg_tables_updated     before update on public.tables     for each row execute function public.set_updated_at();
create trigger trg_orders_updated     before update on public.orders     for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. ORDER MATH — recompute order totals whenever items change
-- ----------------------------------------------------------------------------
-- Any INSERT / UPDATE / DELETE on order_items re-derives subtotal and total
-- on the parent order. The UI only ever *reads* totals. No VAT/tax in this
-- build; total = subtotal - discount + delivery_fee (delivery_fee is a flat
-- per-order snapshot, independent of line items).
create or replace function public.recalc_order_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_order bigint := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
     set subtotal = coalesce(s.sum, 0),
         total    = round(coalesce(s.sum, 0) - o.discount + o.delivery_fee, 2)
    from (select order_id, sum(line_total) as sum
            from public.order_items
           where order_id = target_order
           group by order_id) s
   where o.id = target_order;

  -- order emptied out (all items deleted) — total still reflects delivery_fee
  update public.orders
     set subtotal = 0, total = delivery_fee
   where id = target_order
     and not exists (select 1 from public.order_items where order_id = target_order);

  return null;
end $$;

create trigger trg_order_items_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_totals();

-- ----------------------------------------------------------------------------
-- 6. ORDER-TYPE FIELD VALIDATION (server-side, cannot be bypassed)
-- ----------------------------------------------------------------------------
--   dine_in   → table_number required
--   takeaway  → nothing extra
--   delivery  → customer_name + customer_phone + delivery_address required
create or replace function public.validate_order_fields()
returns trigger language plpgsql as $$
begin
  if new.order_type = 'dine_in' and new.table_number is null then
    raise exception 'dine_in orders require a table_number';
  end if;

  if new.order_type = 'delivery' and (
       new.customer_name    is null or
       new.customer_phone   is null or
       new.delivery_address is null) then
    raise exception 'delivery orders require customer_name, customer_phone and delivery_address';
  end if;

  return new;
end $$;

create trigger trg_orders_validate
  before insert or update on public.orders
  for each row execute function public.validate_order_fields();

-- ----------------------------------------------------------------------------
-- 7. TABLE OCCUPANCY — dine-in orders drive the floor plan
-- ----------------------------------------------------------------------------
create or replace function public.sync_table_occupancy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- a new dine-in order seats the table
  if tg_op = 'INSERT' and new.order_type = 'dine_in' and new.table_number is not null then
    update public.tables set status = 'occupied' where table_number = new.table_number;
  end if;

  -- closing a dine-in order frees the table
  if tg_op = 'UPDATE'
     and new.status in ('completed', 'cancelled')
     and old.status not in ('completed', 'cancelled')
     and new.table_number is not null then
    update public.tables set status = 'available' where table_number = new.table_number;
  end if;

  return null;
end $$;

create trigger trg_orders_occupancy
  after insert or update on public.orders
  for each row execute function public.sync_table_occupancy();

-- ----------------------------------------------------------------------------
-- 8. STOCK — selling a product decrements its stock (never below 0)
-- ----------------------------------------------------------------------------
create or replace function public.decrement_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null then
    update public.products
       set stock = greatest(stock - new.quantity, 0)
     where id = new.product_id;

    insert into public.inventory_logs (product_id, change, reason, notes)
    values (new.product_id, -new.quantity, 'sale',
            'Sold in order #' || (1000 + new.order_id));
  end if;
  return null;
end $$;

create trigger trg_order_items_stock
  after insert on public.order_items
  for each row execute function public.decrement_product_stock();

-- ----------------------------------------------------------------------------
-- 9. AUTH BOOTSTRAP — every signup gets a profile row automatically
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'cashier'                                   -- admins promote users later
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Helper predicates (security definer → no recursive RLS on profiles).

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'cashier', 'kitchen', 'delivery_driver')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.tables         enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.inventory_logs enable row level security;

-- 10.1 profiles — read self (admins read everyone), update self.
--      Inserts happen through the security-definer trigger above.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 10.2 menu catalog — PUBLIC read (the e-menu is anonymous), staff write.
create policy "categories_public_read"  on public.categories for select using (true);
create policy "categories_staff_write"  on public.categories
  for all using (public.is_staff()) with check (public.is_staff());

create policy "products_public_read"    on public.products   for select using (true);
create policy "products_staff_write"    on public.products
  for all using (public.is_staff()) with check (public.is_staff());

create policy "tables_public_read"      on public.tables     for select using (true);
create policy "tables_staff_write"      on public.tables
  for all using (public.is_staff()) with check (public.is_staff());

-- 10.3 orders — anyone may PLACE an order (e-menu checkout); only staff can
--      read the feed, advance statuses, or delete (admins only).
create policy "orders_staff_read"    on public.orders for select using (public.is_staff());
create policy "orders_public_insert" on public.orders for insert with check (true);
create policy "orders_staff_update"  on public.orders
  for update using (public.is_staff()) with check (public.is_staff());
create policy "orders_admin_delete"  on public.orders for delete using (public.is_admin());

create policy "order_items_staff_read"    on public.order_items for select using (public.is_staff());
create policy "order_items_public_insert" on public.order_items for insert with check (true);
create policy "order_items_staff_update"  on public.order_items
  for update using (public.is_staff()) with check (public.is_staff());
create policy "order_items_admin_delete"  on public.order_items for delete using (public.is_admin());

-- 10.4 inventory — staff can read & log movements; only admins purge.
create policy "inventory_staff_read"   on public.inventory_logs for select using (public.is_staff());
create policy "inventory_staff_insert" on public.inventory_logs
  for insert with check (public.is_staff());
create policy "inventory_admin_delete" on public.inventory_logs for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. REALTIME — push orders & items to the cashier feed / kitchen screen
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;

-- full row images so UPDATE/DELETE events carry the payload the UI needs
alter table public.orders      replica identity full;
alter table public.order_items replica identity full;

-- ----------------------------------------------------------------------------
-- 12. PRODUCT IMAGES — extra gallery photos in addition to products.image_url
-- ----------------------------------------------------------------------------
create table public.product_images (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.product_images is 'Extra gallery photos for a product, in addition to the cover image_url.';

create index idx_product_images_product on public.product_images (product_id, sort_order);

alter table public.product_images enable row level security;
create policy "product_images_public_read" on public.product_images for select using (true);
create policy "product_images_staff_write" on public.product_images
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 13. SAUCES — optional add-ons; is_active=false hides one without deleting it
-- ----------------------------------------------------------------------------
create table public.sauces (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  price      numeric(10,2) not null default 0 check (price >= 0),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sauces is 'Sauces / extras selectable on a product. Hidden (is_active=false) ones stay out of the e-menu.';

create trigger trg_sauces_updated_at before update on public.sauces
  for each row execute function public.set_updated_at();

alter table public.sauces enable row level security;
create policy "sauces_public_read" on public.sauces for select using (true);
create policy "sauces_staff_write" on public.sauces
  for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 14. ORDER ITEM SAUCES SNAPSHOT — immutable, same spirit as product_name
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column sauces jsonb not null default '[]'::jsonb;
comment on column public.order_items.sauces is 'Snapshot of chosen sauces at order time: [{"name": "...", "price": 0.50}, ...]';

commit;

-- ============================================================================
-- DONE. Next steps:
--   · Invite staff → their profile row appears via on_auth_user_created,
--     then promote:  update profiles set role = 'admin' where email = '…';
--   · Seed the menu: insert categories → products, then open the POS.
-- ============================================================================
