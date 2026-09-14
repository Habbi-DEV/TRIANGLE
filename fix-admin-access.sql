-- DIAGNOSTIC + FIX: "logged in as admin but no access"
-- Run each block in Supabase Dashboard -> SQL editor, step by step.

-- STEP 1: who are you? (replace with your login email)
-- select id, email from auth.users where email = 'VOTRE_EMAIL_ICI';

-- STEP 2: what role does the backend see?
-- select id, email, full_name, role, created_at from public.profiles order by created_at desc;

-- STEP 3 (most common cause): no row or role='pending'/null.
-- Promote yourself to admin (replace USER_ID):
-- update public.profiles set role = 'admin' where id = 'USER_ID_A Remplacer';

-- STEP 4: if STEP 2 returns 0 rows for you but login works -> trigger missing.
-- Create the missing profile row manually:
-- insert into public.profiles (id, email, role) values ('USER_ID_A Remplacer', 'VOTRE_EMAIL_ICI', 'admin')
-- on conflict (id) do update set role = 'admin';

-- STEP 5 (second most common cause): RLS blocks the frontend reading its own role.
-- AuthContext does: select role from profiles where id = auth.uid().
-- Without this policy it gets null -> dashboard loads but every /api returns 403.
-- NOTE: CREATE POLICY has no IF NOT EXISTS in Postgres -> guarded DO block.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own on public.profiles
      for select to authenticated using (auth.uid() = id);
  end if;
end $$;
-- Allow a user to read is_online of self too (driver toggle):
-- (covered by the same policy above)

-- STEP 6: verify backend sees you as admin (service_role bypasses RLS, so this
-- is what /api/* uses):
-- select p.id, p.email, p.role from public.profiles p join auth.users u on u.id = p.id
-- where u.email = 'VOTRE_EMAIL_ICI';

-- STEP 7: ensure there is always at least one admin left:
-- select count(*) as admin_count from public.profiles where role = 'admin';
