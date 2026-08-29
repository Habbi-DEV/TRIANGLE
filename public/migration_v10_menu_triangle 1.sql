-- ============================================================================
--  RESTOLINK · Migration v10 — Menu Triangle seed data
--  · Seeds the real "TRIANGLE" menu into categories / products / sauces /
--    promotions / settings.logo_url, using the public Supabase Storage
--    bucket "menu-images" (project fmndrfsmaggkdvhlddlp) as the image host.
--  · Fully idempotent: safe to run this file more than once on the same
--    database — nothing gets duplicated. It will also repair a DB that
--    was partially seeded before (missing categories, unlinked products,
--    a broken banner, etc.).
--
--  Run in the Supabase SQL Editor AFTER schema.sql and migration_v2..v9
--  have already been applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. LOGO
-- ----------------------------------------------------------------------------
update public.settings
   set logo_url = 'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Logo/TRIANGLE%20LOGO.png'
 where id = 1;

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES — upsert: creates missing ones, re-activates existing ones.
--    Never overwrites an icon/sort_order you've since customized manually.
-- ----------------------------------------------------------------------------
insert into public.categories (name, icon, sort_order, is_active) values
  ('Burgers',      '🍔', 1,  true),
  ('Sandwiches',   '🥪', 2,  true),
  ('Wraps',        '🌯', 3,  true),
  ('Happy Meal',   '🎁', 4,  true),
  ('Fries Box',    '🍟', 5,  true),
  ('Tenders Box',  '🍗', 6,  true),
  ('Salades',      '🥗', 7,  true),
  ('Pasta',        '🍝', 8,  true),
  ('Pizza',        '🍕', 9,  true),
  ('Mega Pizza',   '🍕', 10, true),
  ('Sides',        '🧀', 11, true)
on conflict (name) do update
  set is_active = true;

-- ----------------------------------------------------------------------------
-- 3. SAUCES — price 0 by default (free add-ons); edit later from the admin.
-- ----------------------------------------------------------------------------
insert into public.sauces (name, price, is_active, sort_order, image_url) values
  ('Sauce Algérienne', 0, true, 1, 'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Sauces/Algeriane.png'),
  ('Harissa',           0, true, 2, 'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Sauces/Harissa.png'),
  ('Ketchup',           0, true, 3, 'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Sauces/ketchup.png'),
  ('Mayonnaise',        0, true, 4, 'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Sauces/Mayonise.png')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 4. PRODUCTS — inserted only if a product with that exact name doesn't
--    already exist, so re-running this file never creates duplicates.
-- ----------------------------------------------------------------------------
insert into public.products (category_id, name, description, price, image_url, is_available)
select v.category_id, v.name, v.description, v.price, v.image_url, true
from (values
  -- Burgers ------------------------------------------------------------
  ((select id from public.categories where name = 'Burgers'),
   'Burger Classic (Chicken)',
   'Poulet crispy, sauce fromagère, salade, tomate, oignon, sauce trika.',
   300::numeric,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Classic.png'),
  ((select id from public.categories where name = 'Burgers'),
   'Burger Beef (Simple)',
   'Viande hachée, sauce fromagère, salade, tomate, oignon, sauce trika.',
   250,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Beef.png'),
  ((select id from public.categories where name = 'Burgers'),
   'Burger Beef (Double)',
   'Double viande hachée, sauce fromagère, salade, tomate, oignon, sauce trika.',
   400,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Beef.png'),
  ((select id from public.categories where name = 'Burgers'),
   'Burger Masterclass',
   'Poulet crispy, viande hachée, sauce fromagère, salade, tomate, oignon, sauce trika.',
   450,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Masterclass.png'),
  ((select id from public.categories where name = 'Burgers'),
   'Burger Banger',
   'Viande hachée farcie au cheddar, oignon caramélisé, sauce fromagère, crudités, sauce trika.',
   500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Banger.png'),
  ((select id from public.categories where name = 'Burgers'),
   'Burger Grill Biggy',
   'X2 viande hachée farcie, x2 cheddar, oignon ring, sauce fromagère, crudités, sauce trika.',
   650,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Grill%20Biggy.png'),
  ((select id from public.categories where name = 'Burgers'),
   'Burger Dagoat',
   'X2 viande hachée farcie, poulet grillé, x2 cheddar, fromage de chèvre, miel, champignon frais, crudités.',
   800,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Dagoat.png'),
  ((select id from public.categories where name = 'Burgers'),
   'Burger Batman (Édition Limitée)',
   'Triple viande hachée farcie, triple tranche de cheddar, oignon caramélisé, champignon frais, cornichon, bacon de dinde, crudités, sauce fromagère.',
   990,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Burger%20Batman.png'),

  -- Sandwiches -----------------------------------------------------------
  ((select id from public.categories where name = 'Sandwiches'),
   'Sandwich Snow',
   'Poulet, frites, sauce fromagère, cheddar, salade, tomate, sauce greenzy.',
   400,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Sandwich%20Snow.png'),
  ((select id from public.categories where name = 'Sandwiches'),
   'Sandwich Crips',
   'Double tenders (poulet crispy), cheddar, crudités, sauce fromagère, sauce trika.',
   450,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Sandwich%20Crips.png'),
  ((select id from public.categories where name = 'Sandwiches'),
   'Sandwich Bloods',
   'Double viande hachée, frites, cheddar, sauce fromagère, salade, tomate, sauce BBQ.',
   450,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Sandwich%20Bloods.png'),
  ((select id from public.categories where name = 'Sandwiches'),
   'Sandwich Diablo',
   'Poulet tandori, oignon caramélisé, poivron, crudités, sauce red hot chilli.',
   450,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Sandwich%20Diablo.png'),
  ((select id from public.categories where name = 'Sandwiches'),
   'Sandwich Melty',
   'Viande au choix, gruyère, camembert, cheddar, sauce fromagère, champignons frais. (550 DA si viande hachée)',
   500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Sandwich%20Melty.png'),
  ((select id from public.categories where name = 'Sandwiches'),
   'Sandwich Fusion',
   'Poulet, viande hachée, poivron, oignon caramélisé, gratiné au cheddar, crudités, sauce trika, sauce fromagère.',
   600,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Sandwich%20Fusion.png'),

  -- Wraps ------------------------------------------------------------------
  ((select id from public.categories where name = 'Wraps'),
   'Wrap Vini',
   'Poulet crispy, sauce fromagère, salade, tomate, oignon, sauce trika.',
   350,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Wrap%20Vini.png'),
  ((select id from public.categories where name = 'Wraps'),
   'Wrap Vidi',
   'Viande hachée, sauce fromagère, salade, tomate, oignon, sauce trika.',
   450,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Wrap%20Vidi.png'),
  ((select id from public.categories where name = 'Wraps'),
   'Wrap Vici',
   'Poulet crispy, viande hachée, sauce fromagère, salade, tomate, oignon, sauce trika.',
   550,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Wrap%20Vici.png'),

  -- Happy Meal ---------------------------------------------------------
  ((select id from public.categories where name = 'Happy Meal'),
   'Happy Meal',
   'Burger + frite + boisson + surprise.',
   500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Meal%20Happy%20Meal.png'),

  -- Fries Box --------------------------------------------------------------
  ((select id from public.categories where name = 'Fries Box'),
   'Fries Box Tasty',
   'Viande au choix (poulet ou viande), sauce fromagère, frites gratinées au cheddar, sauce trika.',
   550,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/FriesBox%20Tasty.png'),
  ((select id from public.categories where name = 'Fries Box'),
   'Fries Box Tandori',
   'Frites, poulet tandori, sauce fromagère, oignon caramélisé, gratinée au cheddar.',
   600,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/FriesBox%20Tandori.png'),
  ((select id from public.categories where name = 'Fries Box'),
   'Fries Box Cheesy',
   'Viande au choix (poulet ou viande), camembert, cheddar, mozza, sauce fromagère, sauce trika.',
   650,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/FriesBox%20Cheesy.png'),
  ((select id from public.categories where name = 'Fries Box'),
   'Fries Box Royal',
   'Poulet crispy, viande hachée, sauce fromagère, oignon caramélisé, poivron, gratinée au cheddar, sauce BBQ.',
   700,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/FriesBox%20Royal.png'),
  ((select id from public.categories where name = 'Fries Box'),
   'Fries Box Grilly',
   'Poulet crispy, poulet grillé, sauce fromagère, champignons frais, oignon caramélisé, gratinée au cheddar, sauce BBQ, poivron.',
   800,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/FriesBox%20Grilly.png'),
  ((select id from public.categories where name = 'Fries Box'),
   'Mega Fries',
   'Poulet grillé, poulet crousty, viande hachée (3 viandes), camembert, cheddar, mozza (3 fromages), champignons frais, poivron.',
   1200,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/FriesBox%20Mega%20Fries.png'),

  -- Tenders Box --------------------------------------------------------
  ((select id from public.categories where name = 'Tenders Box'),
   'Tenders Box X3',
   '3 pièces + frite + sauce maison.',
   500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Tenders%20Box.png'),
  ((select id from public.categories where name = 'Tenders Box'),
   'Tenders Box X6',
   '6 pièces + frite + sauce maison.',
   900,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Tenders%20Box.png'),
  ((select id from public.categories where name = 'Tenders Box'),
   'Tenders Box X9',
   '9 pièces + frite + sauce maison + boisson gazeuse.',
   1500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Tenders%20Box.png'),

  -- Salades ------------------------------------------------------------------
  ((select id from public.categories where name = 'Salades'),
   'Salade Roma',
   'Pasta, thon, maïs, sauce fromagère.',
   400,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Salad%20Roma.png'),
  ((select id from public.categories where name = 'Salades'),
   'Salade Cesar',
   'Salade fraîche, gruyère, poulet crousty, sauce balsamique, graines de sésame, sauce greenzy.',
   500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Salad%20Cesar.png'),
  ((select id from public.categories where name = 'Salades'),
   'Salade BBQ',
   'Salade fraîche, escalope grillée, maïs, mozzarella, cornichon, tomate, sauce mayonnaise, sauce BBQ.',
   600,
   ''), -- pas d'image dans "Menu Triangle" pour l'instant, à uploader puis éditer depuis l'admin

  -- Pasta --------------------------------------------------------------------
  ((select id from public.categories where name = 'Pasta'),
   'Pasta Chiro',
   'Poulet gratiné au cheddar, sauce fromagère.',
   600,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pasta%20Chiro.png'),
  ((select id from public.categories where name = 'Pasta'),
   'Pasta Corleone',
   'Poulet, cheddar, camembert, mozzarella, sauce fromagère.',
   750,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pasta%20Corleone.png'),

  -- Pizza ----------------------------------------------------------------------
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Margarita',
   'Mozzarella, cheddar, thym, huile d''olive.',
   400,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Margarita.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Vege',
   'Champignons frais, maïs, poivron, huile d''olive, mozzarella, cheddar.',
   550,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Vege.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Donna',
   'Thon, cheddar, mozzarella, thym, huile d''olive.',
   600,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Donna.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Mira',
   'Poulet, cheddar, mozzarella, thym, huile d''olive.',
   600,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Mira.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Ragnar',
   'Viande hachée, cheddar, mozzarella, thym, huile d''olive.',
   650,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Ragnar.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Bambina',
   'Poulet, cheddar, mozzarella, thym, huile d''olive.',
   650,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Bambina.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza 3 Fromages',
   'Mozzarella, cheddar, camembert.',
   700,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%203%20Fromages.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Luna',
   'Poulet grillé, dinde fumée, cheddar, mozza.',
   700,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Luna.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Smokey',
   'Viande hachée grillée, fromage fumé, champignons, cheddar, mozza.',
   750,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Smokey.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Hannibal',
   '2 viandes grillées, champignons frais, cheddar, mozzarella.',
   750,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Hannibal.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza 5 Fromages',
   'Gruyère, fromage fumé, champignons, mozza, cheddar, camembert.',
   850,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%205%20Fromages.png'),
  ((select id from public.categories where name = 'Pizza'),
   'Pizza Triangle',
   '1/2 rouge 1/2 blanche, 3 viandes au choix, 3 fromages au choix.',
   990,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Triangle.png'),

  -- Mega Pizza -------------------------------------------------------------------
  ((select id from public.categories where name = 'Mega Pizza'),
   'Mega Pizza 2 Saisons',
   'Grande pizza familiale, 2 saisons au choix.',
   1800,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%202%20Saisons.png'),
  ((select id from public.categories where name = 'Mega Pizza'),
   'Mega Pizza 4 Saisons',
   'Grande pizza familiale, 4 saisons au choix.',
   2500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Mega%20Four%20Seasons.png'),
  ((select id from public.categories where name = 'Mega Pizza'),
   'Mega Triangle',
   'Grande pizza familiale, 1/2 rouge 1/2 blanche, garnitures au choix.',
   3000,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Pizza%20Mega%20Triangle.png'),

  -- Sides ------------------------------------------------------------------
  ((select id from public.categories where name = 'Sides'),
   'Frite (Petite)',
   'Portion de frites, format petit.',
   100,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Fries%20Large.png'),
  ((select id from public.categories where name = 'Sides'),
   'Frite (Grande)',
   'Portion de frites, format grand.',
   250,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Fries%20Large.png'),
  ((select id from public.categories where name = 'Sides'),
   'Frite au Fromage',
   'Frites gratinées au fromage.',
   200,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Cheesy%20Fries.png'),
  ((select id from public.categories where name = 'Sides'),
   'Lava Cheese',
   'Frites gratinées, coeur fromage coulant.',
   250,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Lava%20Cheese.png'),
  ((select id from public.categories where name = 'Sides'),
   'Mozza Sticks X3',
   '3 pièces de mozzarella sticks.',
   350,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Mozza%20Sticks.png'),
  ((select id from public.categories where name = 'Sides'),
   'Mozza Sticks X5',
   '5 pièces de mozzarella sticks.',
   500,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Mozza%20Sticks.png'),
  ((select id from public.categories where name = 'Sides'),
   'Camembert Sticks X3',
   '3 pièces de camembert sticks.',
   300,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Camembert%20Sticks.png'),
  ((select id from public.categories where name = 'Sides'),
   'Camembert Sticks X5',
   '5 pièces de camembert sticks.',
   450,
   'https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Menu%20Triangle/Side%20Camembert%20Sticks.png')

) as v(category_id, name, description, price, image_url)
where not exists (
  select 1 from public.products p where p.name = v.name
);

-- ----------------------------------------------------------------------------
-- 5. RE-LINK any product that ended up without a category (safety net for
--    databases that were partially seeded before this migration existed).
-- ----------------------------------------------------------------------------
update public.products p
   set category_id = c.id
  from (values
    ('Burger Classic (Chicken)','Burgers'),('Burger Beef (Simple)','Burgers'),
    ('Burger Beef (Double)','Burgers'),('Burger Masterclass','Burgers'),
    ('Burger Banger','Burgers'),('Burger Grill Biggy','Burgers'),
    ('Burger Dagoat','Burgers'),('Burger Batman (Édition Limitée)','Burgers'),
    ('Sandwich Snow','Sandwiches'),('Sandwich Crips','Sandwiches'),
    ('Sandwich Bloods','Sandwiches'),('Sandwich Diablo','Sandwiches'),
    ('Sandwich Melty','Sandwiches'),('Sandwich Fusion','Sandwiches'),
    ('Wrap Vini','Wraps'),('Wrap Vidi','Wraps'),('Wrap Vici','Wraps'),
    ('Happy Meal','Happy Meal'),
    ('Fries Box Tasty','Fries Box'),('Fries Box Tandori','Fries Box'),
    ('Fries Box Cheesy','Fries Box'),('Fries Box Royal','Fries Box'),
    ('Fries Box Grilly','Fries Box'),('Mega Fries','Fries Box'),
    ('Tenders Box X3','Tenders Box'),('Tenders Box X6','Tenders Box'),
    ('Tenders Box X9','Tenders Box'),
    ('Salade Roma','Salades'),('Salade Cesar','Salades'),('Salade BBQ','Salades'),
    ('Pasta Chiro','Pasta'),('Pasta Corleone','Pasta'),
    ('Pizza Margarita','Pizza'),('Pizza Vege','Pizza'),('Pizza Donna','Pizza'),
    ('Pizza Mira','Pizza'),('Pizza Ragnar','Pizza'),('Pizza Bambina','Pizza'),
    ('Pizza 3 Fromages','Pizza'),('Pizza Luna','Pizza'),('Pizza Smokey','Pizza'),
    ('Pizza Hannibal','Pizza'),('Pizza 5 Fromages','Pizza'),('Pizza Triangle','Pizza'),
    ('Mega Pizza 2 Saisons','Mega Pizza'),('Mega Pizza 4 Saisons','Mega Pizza'),
    ('Mega Triangle','Mega Pizza'),
    ('Frite (Petite)','Sides'),('Frite (Grande)','Sides'),
    ('Frite au Fromage','Sides'),('Lava Cheese','Sides'),
    ('Mozza Sticks X3','Sides'),('Mozza Sticks X5','Sides'),
    ('Camembert Sticks X3','Sides'),('Camembert Sticks X5','Sides')
  ) as mapping(product_name, category_name)
  join public.categories c on c.name = mapping.category_name
 where p.name = mapping.product_name;

-- ----------------------------------------------------------------------------
-- 6. STOCK — set every product's stock to 100.
-- ----------------------------------------------------------------------------
update public.products set stock = 100;

-- ----------------------------------------------------------------------------
-- 7. PROMOTIONS — home banners (Banniere folder). Delete-then-insert per
--    banner so re-running this file never duplicates or leaves a stale row.
-- ----------------------------------------------------------------------------
delete from public.promotions where image_url ilike '%Banniere%burger%';
delete from public.promotions where image_url ilike '%Banniere%pizza%';
delete from public.promotions where image_url ilike '%Tinders%';

insert into public.promotions (image_url, sort_order, is_active) values
  ('https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Banniere/Banniere%20burger.jpg',  1, true),
  ('https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Banniere/Banniere%20pizza.jpg',   2, true),
  ('https://fmndrfsmaggkdvhlddlp.supabase.co/storage/v1/object/public/menu-images/Banniere/Banniere%20Tinders.jpg', 3, true);

commit;

-- ----------------------------------------------------------------------------
-- 8. Quick sanity check (optional — run manually after the migration):
-- ----------------------------------------------------------------------------
-- select c.name as category, count(p.id) as nb_produits
--   from public.categories c
--   left join public.products p on p.category_id = c.id
--  group by c.name, c.sort_order
--  order by c.sort_order;
--
-- select image_url, sort_order, is_active from public.promotions order by sort_order;
-- ============================================================================
