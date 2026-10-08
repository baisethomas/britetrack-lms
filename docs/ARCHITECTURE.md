# Architecture

BriteTrack is one Next.js App Router application on Supabase. Reads happen in
React Server Components with the caller's session; writes go through server
actions; authorization lives in Postgres row-level security. There is no
separate API server and no application-level permission check that the
database does not also enforce.

The product decisions behind the shape of the data are in
[`ROADMAP.md`](ROADMAP.md). This document is about how the code and the schema
hold those decisions.

## The schema is a school

```
organizations                 a district, or the holding entity of one school
  organization_memberships    org_admin
  schools                     tenant boundary for everything below
    terms → grading_periods
    memberships               (profile, school, role) — school_admin | teacher | student | guardian | staff
    students                  grade level (K = 0, pre-K = -1), date of birth, student number
    guardian_links            guardian ↔ student
    invitations               email-bound token; creates the membership on acceptance
    courses                   catalogue content: subject, grade levels, credits, status
      sections                a class of a course in a term, with a roster
        section_enrollments   teacher | co_teacher | aide | student, with completed_at
        modules               units; unlock_mode free | sequential; optional prerequisite module
          module_items        page | video | quiz | live_session | link; required; published; pass_mark
            module_item_progress
            quiz_questions → quiz_options            (the answer key)
            quiz_attempts  → quiz_answers
        live_sessions         provider zoom | google_meet | external; join_url; recording_url
profiles                      one per auth user; no role column
notifications
```

Three consequences of this shape run through everything else.

**Roles are per school, not per person.** `memberships` is the only place a
role exists. The same account can teach at one school and be a parent at
another, and `lib/data.ts:getContext()` resolves the active school from a
cookie and returns the roles the caller holds *there*. Signup never asks for a
role, and `handle_new_user()` ignores any role in the signup metadata; the only
ways to gain a role are founding a school (`create_school()`, which makes the
founder the admin of a new organization and school) or accepting an invitation
issued by a school admin.

**A teacher's reach is their sections.** Teachers do not have school-wide
power. `can_manage_section()` is true for the section's teacher, co-teachers
and aides, and for the school's admins; it gates content, rosters, quizzes and
live sessions. A teacher at the same school who is not on the section matches
no policy and sees nothing. This is the property that makes the product
sellable to a school, and `tests/db/sections.test.ts` proves it directly.

**The school is a hard wall.** Every table is reachable only through a
school the caller belongs to, with `is_school_member()`, `is_school_admin()`
or a section helper that resolves to one. Organization admins can see and add
schools across their organization and nothing else is cross-school.

## Decisions

### Table privileges come from Supabase; RLS does the constraining

A Supabase project ships `alter default privileges in schema public grant all
on tables to anon, authenticated, service_role`, so every table the baseline
creates is already reachable by the API roles and RLS decides which rows. No
table carries an explicit grant. The few `revoke` statements that exist are
therefore meaningful: the sanitised views are closed to `anon`, and the quiz
answer-key tables are closed to `anon` outright and re-granted to
`authenticated` *without delete*.

`tests/db/shim/02-supabase-post.sql` reproduces those default privileges on
plain Postgres so the suite runs against the same assumption.

### Helpers are `SECURITY DEFINER`, policies are thin

Policies call small helper functions (`is_school_admin`, `teaches_section`,
`can_access_item`, …) that run as definer so a policy on `sections` can
consult `memberships` without triggering the policies on `memberships` in
turn. Two rules learned the hard way are followed throughout:

- A helper returns `false`, never `null`, for a row that does not exist.
  `if not fn()` in PL/pgSQL is a no-op when `fn()` is `null`, which fails
  open. Section helpers `coalesce` for this reason.
- Integrity triggers (`sections_derive_school`, `section_enrollments_check`,
  `modules_check_prerequisite`) are also definer, because a trigger otherwise
  runs with the caller's privileges and its lookups are filtered by RLS,
  which turns "that term is in another school" into "that term does not
  exist" and the wrong error.

### Derived state is derived, never written by clients

- **Unlocking.** An item is open when its module is published and reachable
  (no prerequisite, or the prerequisite module is complete) and, if the
  module is sequential, every required published item before it is complete.
  `can_access_item()` computes this at read time and gates both the content
  and the `module_item_progress` write policies; `lib/progress.ts:
  deriveOutlineState()` mirrors it for rendering so the outline and the
  database never disagree.
- **Section completion.** `section_enrollments.completed_at` is set by
  `sync_section_completion()` when the last required item is done and
  cleared when progress is withdrawn or a required item is added
  (`reset_completion_on_new_item`). The `section_enrollments_guard_completion`
  trigger preserves or nulls the column for any client write, including an
  admin's, so the stamp is only ever the trigger's.
- **Streaks** are counted from completions in `lib/progress.ts`; nothing is
  stored.

### Sanitised views for column-level hiding

RLS cannot hide a column. Where a role may see a row but not all of it, there
is a view: `module_item_catalog` lists items without bodies or video URLs so a
student can see a locked item's title and a guardian can see the outline;
`quiz_question_prompts` and `quiz_option_choices` carry a quiz without
`is_correct` or `explanation`. The views run with their owner's rights, which
is what lets them read the answer-key table at all, so each carries its own
access predicate in its `WHERE` clause (`can_access_item()`,
`can_view_section()`, `can_manage_section()`) and is closed to `anon`.

### `SECURITY DEFINER` RPCs for the writes a policy cannot express

- `create_school(name, organization_name, timezone)` founds an organization
  and a school and grants the caller both admin roles in one transaction.
- `accept_invitation(token)` checks the token against the caller's own email
  and creates the membership, the student record (with grade level) or the
  guardian link, as the invitation says.
- `create_section(course, term, name)` creates a section and enrols a
  teacher-caller as its teacher; a student is refused.
- `school_people(school)` and `find_school_students_by_email(school, emails)`
  expose auth emails to that school's admins only.
- `create_quiz_question(...)`, `submit_quiz_attempt(item, answers)` and
  `quiz_attempt_review(attempt)` are described below.

### The app layer

```
app/
  (auth)/              login, signup, onboarding (found a school or accept an invitation)
  join/[token]         invitation landing → onboarding
  (app)/               authenticated shell; school picker; role-aware nav
    dashboard/         admin | teacher | student | guardian dashboards
    classes/           my sections; section page (outline, roster, live sessions)
      [sectionId]/build         module and item authoring
      [sectionId]/items/[itemId]   item page; quiz player; quiz editor
    children/          guardian view of each child's classes
    admin/             school settings and terms, course catalogue, people and invitations
lib/
  data.ts              getContext(), section outlines, rosters, sessions, children
  progress.ts          outline derivation, streaks
  actions/             auth, onboarding, school, sections, learning, quiz
  supabase/            browser / server / middleware clients
components/            UI primitives, shell, outline, session list
supabase/
  migrations/00001_baseline.sql   the schema and every policy
  functions/           Zoom recording webhook; notification email fan-out
```

Role-specific dashboards are separate server components chosen by
`getContext()`; a person with several roles at a school sees the union of
their navigation. There is no client-side data fetching on core pages.

### Edge functions only for what the app cannot do

- `process-zoom-webhooks` verifies Zoom's HMAC signature and stores the
  recording URL on the matching `live_sessions` row (`provider = 'zoom'`,
  `external_meeting_id`).
- `send-notification-emails` records an in-app notification and sends the
  email through Resend, under the service role.

## Quizzes: the answer key never leaves the database

A quiz item has questions and options, and the load-bearing requirement is
that a student cannot discover which option is correct while the quiz is open.

- `quiz_questions` and `quiz_options` are readable and writable through RLS
  only by people who `can_manage_section()` the item's section. A student
  matches no policy and reads no rows. Supabase runs every signed-in caller as
  `authenticated`, so the tables cannot be revoked from that role without
  locking teachers out too; the policies are what exclude students.
- Students read `quiz_question_prompts` and `quiz_option_choices`, which omit
  `is_correct` and `explanation` and inherit `can_access_item()`.
- Grading happens in `submit_quiz_attempt()`, the only code permitted to read
  the key. It re-checks item access itself, discards option ids that belong to
  another question, unions repeated question ids, scores all-or-nothing per
  question, and records the pass mark it graded against.
- `quiz_attempts` has **no INSERT or UPDATE policy**. Scores exist only
  because grading produced them.
- Passing is what completes a quiz item. The progress write policies refuse a
  completion stamp on a quiz item outright, so a student who has merely
  reached an unlocked quiz cannot stamp it done and walk into the next item;
  `submit_quiz_attempt()`, running as definer, is the one path that grants it.
- `quiz_attempt_review()` returns the key, explanations and option labels for
  an attempt that is already submitted, to its owner, their guardians, the
  section's staff and the school's admins.
- Retiring a question sets `archived_at`; there is no delete policy and no
  delete grant on either table, so past attempts stay explicable.
- `create_quiz_question()` writes a question and its options in one call and
  validates them (two options, at least one correct, exactly one for
  single-choice) so a half-authored question can never be served.

The guarantee is about a quiz *in progress*. Review reveals the key
afterwards, and retakes are unlimited, so a quiz here is a learning
checkpoint, not an invigilated exam. The gradebook in Phase 2 adds attempt
limits and withheld review where a quiz needs to count.
