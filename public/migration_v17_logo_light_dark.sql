-- ============================================================================
--  TRIANGLE · Logo système clair/sombre — migration v17 (idempotente)
--  À exécuter dans le SQL Editor de Supabase AVANT de déployer le code,
--  sinon api/settings.js (GET) sélectionne des colonnes qui n'existent pas
--  encore et l'endpoint renvoie une erreur.
--
--  Un seul `logo_url` ne peut pas servir les deux thèmes : le logo à texte
--  noir disparaît sur le fond zinc-950 du mode sombre (et dans la barre
--  latérale admin, noire dans les deux thèmes). On stocke donc les deux
--  fichiers de la même marque :
--
--    light_logo_url → wordmark noir, fonds clairs
--    dark_logo_url  → wordmark blanc, fonds sombres
--
--  `logo_url` est conservée : c'est la valeur de repli pour les restaurants
--  qui n'ont pas encore chargé la paire, et la colonne que lit encore tout
--  ce qui n'est pas passé par <AppLogo /> (voir src/lib/logo.ts).
-- ============================================================================

begin;

alter table public.settings
  add column if not exists light_logo_url text not null default '';

alter table public.settings
  add column if not exists dark_logo_url text not null default '';

comment on column public.settings.light_logo_url is
  'Logo à texte noir, affiché sur les fonds clairs (mode clair, reçus imprimés, caisse). Repli sur logo_url si vide.';
comment on column public.settings.dark_logo_url is
  'Logo à texte blanc, affiché sur les fonds sombres (mode sombre, barre latérale admin, barre livreur). Repli sur light_logo_url puis logo_url si vide.';

-- Backfill : le logo actuel est celui à texte noir (il vivait sur un header
-- blanc), donc il devient le logo clair. Rien n'est écrasé si la colonne a
-- déjà été remplie, et le dark reste vide jusqu'à l'upload du fichier blanc
-- dans /admin/settings — d'ici là la chaîne de repli de resolveLogoSrc()
-- reproduit exactement le comportement d'avant cette migration.
update public.settings
   set light_logo_url = logo_url
 where coalesce(light_logo_url, '') = ''
   and coalesce(logo_url, '') <> '';

commit;

-- ============================================================================
--  DONE. Ensuite, dans /admin/settings :
--    1. « Logo — mode clair »  : le fichier à texte noir  (déjà pré-rempli)
--    2. « Logo — mode sombre » : le fichier à texte blanc (à charger)
--
--  Vérification rapide :
--    select light_logo_url, dark_logo_url, logo_url from public.settings;
-- ============================================================================
