-- ============================================================================
-- v12 — Page "Personnel & rôles" (admin) + correctif du trigger v11
--
-- Contexte : la v11 a ajouté trg_profiles_prevent_role_escalation, qui
-- annule tout changement de `role` tant que public.is_admin() ne renvoie
-- pas true. Cette fonction dépend de auth.uid(), qui n'est peuplé QUE sur
-- les requêtes passées par PostgREST avec un JWT utilisateur. Deux
-- conséquences pratiques :
--   1. Éditer `role` depuis le Table Editor du dashboard Supabase ne
--      fonctionne pas : la connexion n'a pas de JWT, auth.uid() vaut NULL,
--      is_admin() renvoie false, et le trigger réécrit la valeur d'origine.
--   2. La nouvelle route /api/staff (PUT), qui utilise la clé
--      SUPABASE_SERVICE_ROLE_KEY et est déjà protégée par requireAdmin()
--      côté serveur, tomberait dans le même piège : auth.uid() vaut NULL
--      pour une connexion service_role aussi.
--
-- Ce script autorise explicitement le rôle Postgres "service_role" (donné
-- par la clé service_role) à passer le trigger, en plus des admins déjà
-- authentifiés. Le contrôle "qui a le droit" reste entièrement fait par
-- requireAdmin() dans api/staff.js — ce trigger ne fait que ne plus
-- bloquer un appel déjà légitime.
--
-- À exécuter une seule fois dans le SQL Editor Supabase.
-- ============================================================================

create or replace function public.prevent_self_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and not public.is_admin()
     and auth.role() is distinct from 'service_role' then
    new.role := old.role;
  end if;
  return new;
end $$;
