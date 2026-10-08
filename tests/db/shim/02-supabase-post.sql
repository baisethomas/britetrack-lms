-- Applied AFTER the migration: grant the API roles table access, matching a
-- real Supabase project. Row-level authorization is still entirely up to RLS.
--
-- This is not a convenience that hides missing grants. Supabase sets
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role`, so tables arrive already reachable and RLS
-- decides the rows; no table in the migration carries an explicit grant.
-- The blanket grant below reproduces that starting point, which is why the
-- revokes that follow it are the interesting part.
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- The migration's own revokes run before the blanket grant above, so re-apply
-- them afterwards: the browsing and quiz views are authenticated-only, and
-- the answer key is never readable anonymously nor deletable at all.
revoke all on public.module_item_catalog from anon;
revoke all on public.quiz_question_prompts from anon;
revoke all on public.quiz_option_choices from anon;
grant select on public.module_item_catalog to authenticated;
grant select on public.quiz_question_prompts to authenticated;
grant select on public.quiz_option_choices to authenticated;

revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_options from anon, authenticated;
grant select, insert, update on public.quiz_questions to authenticated;
grant select, insert, update on public.quiz_options to authenticated;
