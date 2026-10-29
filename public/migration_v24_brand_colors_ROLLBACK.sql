-- ROLLBACK de la migration v24 (couleurs de marque).
-- brand_color (couleur principale) existait avant et est conservée.
begin;
alter table public.settings drop constraint if exists settings_default_theme_check;
alter table public.settings drop constraint if exists settings_brand_color_2_check;
alter table public.settings drop column if exists default_theme;
alter table public.settings drop column if exists brand_color_2;
commit;
