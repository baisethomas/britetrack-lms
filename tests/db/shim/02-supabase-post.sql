-- Applied AFTER the migration: grant the API roles table access, matching a
-- real Supabase project. Row-level authorization is still entirely up to RLS.
--
-- The migration's own `revoke ... from anon` on lesson_catalog runs before
-- this, so re-apply that restriction afterwards to keep the view
-- authenticated-only.
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

revoke all on public.lesson_catalog from anon;
grant select on public.lesson_catalog to authenticated;
