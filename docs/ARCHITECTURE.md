# Architecture

## Why the rewrite

The original repository accumulated scaffolding without a working product:

- `backend/` was an Express + Mongoose skeleton with empty `controllers/`,
  `models/`, `routes/`, and `middleware/` directories — while the README and
  database docs described Supabase Postgres, not MongoDB.
- The three Supabase edge functions were stubs whose bodies were TODO comments
  (the Zoom webhook even compared a shared secret with `===` instead of
  verifying Zoom's HMAC signature).
- The GitHub Actions workflow files were empty (0 bytes).
- There was no frontend at all.

Rather than grow that skeleton, the rewrite collapses the stack to two pieces
that carry their weight.

## Decisions

### One Next.js app, no separate API server

Next.js App Router with React Server Components + server actions replaces the
planned Express API. Reads happen in server components with the caller's
Supabase session; writes go through server actions. This removes an entire
deployment, a second auth story, and all client-side data fetching for core
pages.

### Postgres RLS is the authorization layer

Every table has row-level security; policies encode the role model
(admin / student / parent) once, at the data layer, so neither the app nor
future clients (mobile, integrations) can bypass it. Two `security definer`
functions (`admin_list_users`, `find_students_by_email`) expose auth emails to
admins only — the API roles cannot read `auth.users` directly.

### Sequential unlocking is derived, not stored — and enforced in RLS

A lesson is "locked" if the course has `sequential_unlock` and the previous
lesson (by `position`) is not completed. Deriving this from `lesson_progress`
at read time (`lib/data.ts:getLessonsWithState`) avoids an unlock-state table
that could drift when admins reorder or insert lessons. The same rule is
enforced at the data layer: the `can_access_lesson()` function gates
`lesson_progress` writes, so a student cannot record progress on a locked
lesson or on a course they are not enrolled in, even calling the API
directly.

### Streaks are computed from completions

The daily streak counts consecutive UTC days with at least one lesson
completion, ending today or yesterday. No counters to maintain, nothing to
reset by cron.

### Edge functions only for what the app can't do

- `process-zoom-webhooks` — receives Zoom events (verifies the
  `x-zm-signature` HMAC and answers the endpoint-validation challenge), and
  writes recording URLs onto `live_sessions` with the service role.
- `send-notification-emails` — service-role-only endpoint that records an
  in-app notification and sends the email via Resend.

Bulk enrollment, previously an edge-function stub, is an in-app admin form —
it needs the admin's session and RLS, not the service role.

## Quizzes: the answer key never leaves the database

A quiz lesson has questions and options, and the load-bearing requirement is
that a student cannot discover which option is correct. RLS has no column-level
security, so hiding a column is not something a policy can express. Instead:

- `quiz_questions` and `quiz_options` are **admin-only through RLS**, and
  `REVOKE`d from `anon` outright. They cannot be revoked from `authenticated`:
  Supabase runs every signed-in caller under that one role, so admins author
  through it too, and a blanket revoke denies them before any policy is
  evaluated. The admin-only policies are what exclude students, who match no
  policy and so read no rows.
- Students read `quiz_question_prompts` and `quiz_option_choices`, views that
  simply do not contain `is_correct` or `explanation`. They inherit the
  lesson's own access rule via `can_access_lesson()`.
- Grading happens in `submit_quiz_attempt()`, a `SECURITY DEFINER` function —
  the only thing permitted to read the key. It re-checks lesson access itself
  rather than trusting the caller, discards option ids that belong to another
  question, and scores all-or-nothing per question.
- `quiz_attempts` has **no student INSERT or UPDATE policy**. Scores exist only
  because the grading function produced them, so a pass cannot be forged the
  way a hand-written row could be.
- `quiz_attempt_review()` returns the key and explanations, but only for an
  attempt that is already submitted and only to its owner, their linked
  parents, or an admin.

Passing is what completes a quiz lesson — there is no "mark complete" button —
so a quiz genuinely gates the next lesson under sequential unlock. Retakes are
unlimited; every attempt is kept.

Two consequences of keeping attempts follow from that. Each attempt stores the
`pass_mark` it was graded against, so moving a lesson's threshold later cannot
make an old result claim it needed a mark it never did. And retiring a question
sets `archived_at` rather than deleting it: a delete would cascade its
`quiz_answers` away while the attempt's stored score still counted them.
Archived questions disappear from the player and from future grading; past
results keep them.

## Data model

```
profiles (role: admin|student|parent, onboarded)
parent_student_links (parent_id, student_id)
courses (status: draft|published|archived, sequential_unlock)
lessons (course_id, position, content_type: video|article|quiz|live_session)
enrollments (course_id, student_id, completed_at)
lesson_progress (lesson_id, student_id, started_at, completed_at)
live_sessions (course_id, zoom_meeting_id, join_url, recording_url)
notifications (user_id, type, read_at)
quiz_questions (lesson_id, prompt, explanation, kind, points, position)
quiz_options (question_id, label, is_correct, position)
quiz_attempts (lesson_id, student_id, score, max_score, passed, submitted_at)
quiz_answers (attempt_id, question_id, selected_option_ids, is_correct)
```

`lessons.pass_mark` is the percent of available points a quiz lesson requires.

`enrollments.completed_at` is derived by a database trigger
(`sync_enrollment_completion`) when the last lesson of a course is completed —
students have no UPDATE policy on enrollments, so it cannot be forged. Adding
a lesson to a course clears affected completion stamps
(`reset_completion_on_new_lesson`).
