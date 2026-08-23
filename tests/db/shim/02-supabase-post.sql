-- Applied AFTER the migration: grant the API roles table access, matching a
-- real Supabase project. Row-level authorization is still entirely up to RLS.
--
-- This is not a convenience that hides missing grants. Supabase sets
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role`, so tables arrive already reachable and RLS
-- decides the rows; no table in these migrations carries an explicit grant.
-- The blanket grant below reproduces that starting point, which is why the
-- revokes that follow it are the interesting part.
--
-- The migration's own `revoke ... from anon` on lesson_catalog runs before
-- this, so re-apply that restriction afterwards to keep the view
-- authenticated-only.
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

revoke all on public.lesson_catalog from anon;
grant select on public.lesson_catalog to authenticated;

-- Same for the quiz answer key: the migration locks these down, and the
-- blanket grant above would otherwise hand them back. `authenticated` keeps
-- DML because admins author through their own session under that role — the
-- admin-only RLS policies are what exclude students.
revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_options from anon, authenticated;
grant select, insert, update on public.quiz_questions to authenticated;
grant select, insert, update on public.quiz_options to authenticated;
revoke all on public.quiz_question_prompts from anon;
revoke all on public.quiz_option_choices from anon;
grant select on public.quiz_question_prompts to authenticated;
grant select on public.quiz_option_choices to authenticated;
