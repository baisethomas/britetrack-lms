-- Quiz lessons: questions, options, attempts and server-side grading.
--
-- The load-bearing constraint is that a student must never be able to read
-- which option is correct. RLS has no column-level security, so:
--   * quiz_questions / quiz_options are admin-only at the table level;
--   * students read the sanitised quiz_question_prompts / quiz_option_choices
--     views, which simply do not contain is_correct or the explanation;
--   * grading happens inside submit_quiz_attempt(), a SECURITY DEFINER
--     function, so the answer key is never sent to the client.
-- This mirrors how lesson_catalog already shields lesson content.

create type public.quiz_question_kind as enum ('single_choice', 'multi_choice');

-- Percent of available points needed to pass, and so to complete the lesson.
alter table public.lessons
  add column pass_mark int not null default 70
    check (pass_mark between 0 and 100);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  prompt text not null,
  -- Shown only after an attempt is graded, never before.
  explanation text not null default '',
  kind public.quiz_question_kind not null default 'single_choice',
  points int not null default 1 check (points > 0),
  position int not null,
  -- Retiring a question archives it rather than deleting it: past attempts
  -- reference it through quiz_answers, and a cascade would leave their stored
  -- score describing questions that no longer exist.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lesson_id, position)
);

create index quiz_questions_lesson_idx on public.quiz_questions (lesson_id, position);

create table public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  position int not null,
  unique (question_id, position)
);

create index quiz_options_question_idx on public.quiz_options (question_id, position);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score int,
  max_score int,
  -- The threshold actually applied, so a later change to lessons.pass_mark
  -- cannot rewrite what a historical result claims was required.
  pass_mark int,
  passed boolean
);

create index quiz_attempts_student_idx on public.quiz_attempts (student_id, lesson_id);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  is_correct boolean not null default false,
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Student-facing views: everything needed to answer, nothing that gives it away
-- ---------------------------------------------------------------------------
create view public.quiz_question_prompts as
  select q.id, q.lesson_id, q.prompt, q.kind, q.points, q.position
  from public.quiz_questions q;

create view public.quiz_option_choices as
  select o.id, o.question_id, o.label, o.position
  from public.quiz_options o;

-- Authoring happens through the app with the admin's own session, and Supabase
-- runs every signed-in caller as `authenticated` — there is no separate admin
-- database role to grant to. So the answer-key tables are withheld from `anon`
-- entirely and left to RLS for `authenticated`: the admin-only policies below
-- are what exclude students, who match no policy and so read no rows.
revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_options from anon, authenticated;
grant select, insert, update, delete on public.quiz_questions to authenticated;
grant select, insert, update, delete on public.quiz_options to authenticated;
revoke all on public.quiz_question_prompts from anon;
revoke all on public.quiz_option_choices from anon;
grant select on public.quiz_question_prompts to authenticated;
grant select on public.quiz_option_choices to authenticated;

-- ---------------------------------------------------------------------------
-- Grading
-- ---------------------------------------------------------------------------
-- Normalise a selection to a sorted, de-duplicated array so that comparing a
-- student's answer against the key is order- and duplicate-insensitive.
create or replace function public.normalise_option_ids(ids uuid[])
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(v order by v), '{}'::uuid[])
  from (select distinct unnest(coalesce(ids, '{}'::uuid[])) as v) t;
$$;

/**
 * Grade a submission and record the attempt.
 *
 * p_answers is [{"question_id": uuid, "option_ids": [uuid, ...]}, ...].
 * Scoring is all-or-nothing per question: the selected set must match the
 * correct set exactly, which is what makes multi-choice meaningful.
 *
 * Runs as definer because it is the only thing permitted to read
 * quiz_options.is_correct. It re-checks lesson access itself rather than
 * trusting the caller.
 */
create or replace function public.submit_quiz_attempt(
  p_lesson_id uuid,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_attempt uuid;
  v_max int := 0;
  v_score int := 0;
  v_pass_mark int;
  v_passed boolean;
  v_question record;
  v_selected uuid[];
  v_correct uuid[];
  v_is_correct boolean;
begin
  if v_student is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_access_lesson(p_lesson_id) then
    raise exception 'forbidden';
  end if;

  select pass_mark into v_pass_mark
  from public.lessons where id = p_lesson_id;
  if v_pass_mark is null then
    raise exception 'lesson not found';
  end if;

  if not exists (
    select 1 from public.quiz_questions
    where lesson_id = p_lesson_id and archived_at is null
  ) then
    raise exception 'lesson has no questions';
  end if;

  insert into public.quiz_attempts (lesson_id, student_id)
  values (p_lesson_id, v_student)
  returning id into v_attempt;

  for v_question in
    select q.id, q.points
    from public.quiz_questions q
    where q.lesson_id = p_lesson_id and q.archived_at is null
    order by q.position
  loop
    v_max := v_max + v_question.points;

    -- Only options that actually belong to this question count, so a crafted
    -- payload cannot smuggle in ids from elsewhere.
    select public.normalise_option_ids(array_agg(o.id)) into v_selected
    from public.quiz_options o
    where o.question_id = v_question.id
      and o.id in (
        select (jsonb_array_elements_text(a -> 'option_ids'))::uuid
        from jsonb_array_elements(p_answers) a
        where (a ->> 'question_id')::uuid = v_question.id
      );
    v_selected := coalesce(v_selected, '{}'::uuid[]);

    select public.normalise_option_ids(array_agg(o.id)) into v_correct
    from public.quiz_options o
    where o.question_id = v_question.id and o.is_correct;
    v_correct := coalesce(v_correct, '{}'::uuid[]);

    -- An unanswered question is never correct, even if the key is empty.
    v_is_correct := cardinality(v_selected) > 0 and v_selected = v_correct;
    if v_is_correct then
      v_score := v_score + v_question.points;
    end if;

    insert into public.quiz_answers
      (attempt_id, question_id, selected_option_ids, is_correct)
    values (v_attempt, v_question.id, v_selected, v_is_correct);
  end loop;

  v_passed := v_max > 0 and (v_score::numeric * 100 / v_max) >= v_pass_mark;

  update public.quiz_attempts
  set submitted_at = now(),
      score = v_score,
      max_score = v_max,
      pass_mark = v_pass_mark,
      passed = v_passed
  where id = v_attempt;

  -- Passing is what completes a quiz lesson; failing leaves it open to retry.
  if v_passed then
    insert into public.lesson_progress (lesson_id, student_id, completed_at)
    values (p_lesson_id, v_student, now())
    on conflict (lesson_id, student_id)
      do update set completed_at = excluded.completed_at;
  end if;

  return v_attempt;
end;
$$;

/**
 * Per-question breakdown of a graded attempt, including the answer key and
 * explanation — safe to expose only because the attempt is already submitted.
 * Readable by the student who made it, their linked parents, and admins.
 */
create or replace function public.quiz_attempt_review(p_attempt_id uuid)
returns table (
  question_id uuid,
  prompt text,
  explanation text,
  points int,
  question_position int,
  is_correct boolean,
  selected_option_ids uuid[],
  correct_option_ids uuid[]
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_submitted timestamptz;
begin
  select a.student_id, a.submitted_at into v_owner, v_submitted
  from public.quiz_attempts a where a.id = p_attempt_id;
  if v_owner is null then
    raise exception 'attempt not found';
  end if;
  if v_submitted is null then
    raise exception 'attempt not submitted';
  end if;

  if not (
    v_owner = auth.uid()
    or public.current_user_role() = 'admin'
    or exists (
      select 1 from public.parent_student_links l
      where l.parent_id = auth.uid() and l.student_id = v_owner
    )
  ) then
    raise exception 'forbidden';
  end if;

  return query
    select q.id, q.prompt, q.explanation, q.points, q.position,
           ans.is_correct, ans.selected_option_ids,
           public.normalise_option_ids(array_agg(o.id) filter (where o.is_correct))
    from public.quiz_answers ans
    join public.quiz_questions q on q.id = ans.question_id
    left join public.quiz_options o on o.question_id = q.id
    where ans.attempt_id = p_attempt_id
    group by q.id, q.prompt, q.explanation, q.points, q.position,
             ans.is_correct, ans.selected_option_ids
    order by q.position;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.quiz_questions enable row level security;
alter table public.quiz_options enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;

-- Authoring is admin-only; students never touch these tables directly.
create policy "admins manage questions" on public.quiz_questions
  for all using (public.current_user_role() = 'admin');
create policy "admins manage options" on public.quiz_options
  for all using (public.current_user_role() = 'admin');

-- Attempts are created by submit_quiz_attempt(), never inserted by a client,
-- so there is deliberately no student INSERT or UPDATE policy: a score cannot
-- be forged the way a hand-written row could be.
create policy "students read own attempts" on public.quiz_attempts
  for select using (student_id = auth.uid());
create policy "parents read linked attempts" on public.quiz_attempts
  for select using (
    exists (
      select 1 from public.parent_student_links l
      where l.parent_id = auth.uid() and l.student_id = quiz_attempts.student_id
    )
  );
create policy "admins read attempts" on public.quiz_attempts
  for select using (public.current_user_role() = 'admin');

create policy "read answers of visible attempts" on public.quiz_answers
  for select using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_answers.attempt_id
        and (
          a.student_id = auth.uid()
          or public.current_user_role() = 'admin'
          or exists (
            select 1 from public.parent_student_links l
            where l.parent_id = auth.uid() and l.student_id = a.student_id
          )
        )
    )
  );

-- The prompt/choice views inherit the lesson's own access rule.
create or replace view public.quiz_question_prompts as
  select q.id, q.lesson_id, q.prompt, q.kind, q.points, q.position
  from public.quiz_questions q
  where q.archived_at is null
    and (public.can_access_lesson(q.lesson_id)
         or public.current_user_role() = 'admin');

create or replace view public.quiz_option_choices as
  select o.id, o.question_id, o.label, o.position
  from public.quiz_options o
  join public.quiz_questions q on q.id = o.question_id
  where q.archived_at is null
    and (public.can_access_lesson(q.lesson_id)
         or public.current_user_role() = 'admin');

-- Expose pass_mark for browsing so a quiz lesson can advertise its threshold.
create or replace view public.lesson_catalog as
  select l.id, l.course_id, l.title, l.summary, l.content_type,
         l.duration_minutes, l.position, l.pass_mark
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where c.status = 'published';

revoke all on public.lesson_catalog from anon;
grant select on public.lesson_catalog to authenticated;
