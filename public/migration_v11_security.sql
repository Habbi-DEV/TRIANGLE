-- ============================================================================
-- v11 — Durcissement sécurité suite à l'audit
-- DÉJÀ APPLIQUÉ en production (projet Supabase "resto") au moment de l'audit.
-- Conservé ici pour reproduire l'état sur un autre environnement
-- (staging / nouvelle instance) via le SQL Editor ou `supabase db push`.
--
-- IMPORTANT : l'ajout d'une valeur d'enum (étape 1) doit être validé
-- (COMMIT) avant de pouvoir être utilisé par la suite du script — exécutez
-- les deux blocs ci-dessous dans deux requêtes SÉPARÉES si votre client SQL
-- ne le fait pas automatiquement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ÉTAPE 1/2 — à committer seule avant l'étape 2
-- ----------------------------------------------------------------------------
alter type public.user_role add value if not exists 'pending';


-- ----------------------------------------------------------------------------
-- ÉTAPE 2/2
-- ----------------------------------------------------------------------------
begin;

-- 1. FAILLE CRITIQUE : auto-promotion de rôle.
-- La policy "profiles_update_own" (using auth.uid()=id) ne restreint aucune
-- colonne : un utilisateur authentifié pouvait appeler directement
-- PATCH /rest/v1/profiles?id=eq.<son-uuid> { "role": "admin" } via l'API
-- PostgREST (en contournant entièrement le code Vercel) et devenir admin.
create or replace function public.prevent_self_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_prevent_role_escalation on public.profiles;
create trigger trg_profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

-- 2. Nouveaux comptes : rôle neutre 'pending' au lieu de 'cashier'.
-- Empêche qu'une connexion Google non restreinte (LoginPage.tsx) n'octroie
-- automatiquement les droits staff. Les comptes existants ne sont PAS
-- rétroactivement modifiés.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'pending'
  );
  return new;
end $$;

-- 3. Advisor WARN : search_path mutable.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.validate_order_fields()
returns trigger language plpgsql set search_path = public as $$
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

-- 4. Advisor WARN : fonctions SECURITY DEFINER exposées en RPC public.
revoke execute on function public.current_user_role()            from public, anon, authenticated;
revoke execute on function public.decrement_product_stock()       from public, anon, authenticated;
revoke execute on function public.recalc_order_totals()           from public, anon, authenticated;
revoke execute on function public.sync_table_occupancy()          from public, anon, authenticated;
revoke execute on function public.handle_new_user()                from public, anon, authenticated;
revoke execute on function public.prevent_self_role_escalation()   from public, anon, authenticated;

-- is_staff()/is_admin() restent nécessaires à `authenticated` : elles sont
-- utilisées DANS les policies RLS que ce rôle doit pouvoir évaluer.
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_staff() to authenticated;
grant  execute on function public.is_admin() to authenticated;

commit;

-- ----------------------------------------------------------------------------
-- ÉTAPE MANUELLE (non-SQL) restante :
--   Dashboard Supabase → Authentication → Policies → activer
--   "Leaked password protection" (vérification HaveIBeenPwned).
-- ----------------------------------------------------------------------------
