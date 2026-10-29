-- ============================================================================
--  TRIANGLE · Migration v24 — Couleurs de marque (réglables dans Paramètres)
--
--  settings.brand_color existe déjà (couleur principale, #rrggbb).
--  Ajoute :
--    brand_color_2  : 2e couleur de la marque (optionnelle, NULL = aucune)
--    default_theme  : thème proposé aux NOUVEAUX visiteurs
--                     'system' (suit le téléphone, comportement actuel),
--                     'dark' ou 'light'
--
--  Le blanc et le noir ne changent jamais : seule la couleur de marque varie.
--  Valeurs par défaut = comportement actuel (orange, thème du téléphone).
--
--  Idempotent. Pour annuler : migration_v24_brand_colors_ROLLBACK.sql
-- ============================================================================

begin;

alter table public.settings
  add column if not exists brand_color_2 text;

alter table public.settings
  add column if not exists default_theme text not null default 'system';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_default_theme_check') then
    alter table public.settings
      add constraint settings_default_theme_check
      check (default_theme in ('system', 'dark', 'light'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settings_brand_color_2_check') then
    alter table public.settings
      add constraint settings_brand_color_2_check
      check (brand_color_2 is null or brand_color_2 ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

commit;
