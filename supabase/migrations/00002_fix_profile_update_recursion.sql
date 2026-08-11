-- Fix: "update own profile" was unusable.
--
-- The original policy's WITH CHECK compared the new role against a subquery
-- reading public.profiles. Because that read is itself subject to the
-- profiles policies, Postgres raised
--   "infinite recursion detected in policy for relation profiles"
-- for every self-update, so users could never change their own name.
--
-- public.current_user_role() is SECURITY DEFINER, so it reads the role
-- without re-entering RLS. The intent is unchanged: a user may edit their own
-- profile, but may not change their own role.

drop policy if exists "update own profile" on public.profiles;

create policy "update own profile" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_user_role());
