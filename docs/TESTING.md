# Testing

Two suites, run by Vitest as separate projects.

| Command | What it covers | Needs a database |
| --- | --- | --- |
| `npm run test:unit` | Pure logic, server-action validation against a faked Supabase, the middleware's route gating, and a static check of the server/client module boundary | no |
| `npm run test:db` | Every Postgres RLS policy, trigger, and RPC in the baseline schema | yes |
| `npm test` | Both | yes |

## Unit tests

`lib/progress.ts`, `lib/safe-redirect.ts`, `lib/roster.ts` and the pure
helpers in `lib/data.ts` hold the logic worth testing in isolation; the
data-fetching wrappers delegate to them. `deriveOutlineState()` is the
client-side mirror of the database's `can_access_item()`, so its tests
describe the same cases the database suite does (sequential and free modules,
optional items, prerequisite modules, unpublished content). Time is injected
(`computeStreak(dates, now)`) so streak assertions are deterministic.

Three further groups under `tests/unit/`:

- **`actions/`** — the server actions' form validation and payload shaping,
  with Supabase replaced by the fake in `helpers/supabase-mock.ts`. These
  assert what reaches the database (a quiz question's labels and correctness
  flags stay aligned when blank rows are dropped; an invitation's email is
  lower-cased; a roster paste is parsed) and what a badly filled form is
  told. RLS decides who may do these things; that is the database suite's job.
- **`middleware`** — an anonymous request to an app route is sent to
  `/login` with `next` set, public routes pass, and a refreshed session
  cookie is forwarded to the browser.
- **`server-client-boundary`** — a static scan of `app/`, `components/` and
  `lib/` for the React Server Components mistakes that `next build` accepts
  and the first request then throws on: a server module importing a function
  or constant (anything but a component or a type) from a `"use client"`
  module; a client module importing `next/headers`, the server Supabase
  client or the data layer; and a `"use server"` module exporting anything
  but async functions and types. The first of these once took down every
  page in the app shell.

## Database tests

These are the important ones. Authorization for this app lives entirely in
Postgres — RLS policies, `SECURITY DEFINER` functions, and triggers — so the
tests exercise the database directly rather than mocking it.

### Running them

```bash
npm run db:test:up     # throwaway Postgres in Docker on port 54329
npm run test:db
npm run db:test:down
```

Any Postgres 16 will do; point the suite at it with `DATABASE_URL` if you
would rather not use Docker:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/britetrack_test npm run test:db
```

### Destructive-target guard

The harness DROPs the `public` and `auth` schemas with `CASCADE` on every run,
so a `DATABASE_URL` aimed at a real project would destroy it. Two gates stand
in front of that.

**1. The database name.** Checked before connecting, so a typo fails fast.
The name must contain `test` as a whole word, which rules out Supabase's
default `postgres` database:

```
Refusing to rebuild the schema in database "postgres".
```

**2. What the database actually contains.** A naming convention is only a
convention — somebody's real database may well be called `test`. So after
connecting, the harness proceeds only if the database is empty, or if it
carries the marker comment this harness stamps on `public` after each
rebuild. Anything else is somebody else's data:

```
Refusing to rebuild the schema in database "acme_test".

It contains 40 object(s) that this harness did not create,
and dropping the public and auth schemas with CASCADE would destroy them.
```

So a fresh database is adopted and marked on first run, later runs recognise
their own marker, and a populated database the harness does not own is
refused regardless of its name.

`BRITETRACK_ALLOW_DESTRUCTIVE_DB=1` bypasses both, for a database you are
certain is disposable. It is deliberately *not* required for the normal
workflow: a guard that every documented command had to disable would be set
permanently and would stop meaning anything.

### How the harness works

A real Supabase project supplies an `auth` schema and the `anon` /
`authenticated` / `service_role` API roles. `tests/db/shim/` provides just
enough of that to run the migrations unchanged — the `auth.users` table,
`auth.uid()` reading the `request.jwt.claims` GUC, and the role grants
Supabase applies by default. Running the full Supabase stack would be far
heavier and would not test anything extra.

Each run:

1. drops and recreates `public`,
2. applies the pre-shim, then every file in `supabase/migrations` in order,
   then the post-shim grants.

Every test then runs inside a transaction that is rolled back, so tests are
independent and order-insensitive.

`db.seed(...)` runs as the schema owner and is for arranging fixtures only.
Assertions go through `db.asUser(id, ...)` or `db.asAnon(...)`, which switch
to the unprivileged API roles — those cannot bypass RLS, so a policy gap shows
up as a test failure. Use `q.run()` when a statement should succeed and
`q.attempt()` when it should be refused; `attempt` wraps the statement in a
savepoint and reports the error instead of throwing.

Note that a policy can refuse a write two ways: a `WITH CHECK` violation
raises an error, while a `USING` mismatch silently matches zero rows. Tests
that assert refusal therefore use `returning id` and check both:

```ts
expect(result.ok && result.rows.length > 0).toBe(false);
```

### What is covered

One file per concern under `tests/db/`:

- **`tenancy`** — founding a school makes the founder its admin and the
  organisation's admin and ignores any role in signup metadata; one school's
  admin cannot see another school, its people directory, or its courses;
  nobody can grant themselves a role; a district admin reaches every school in
  the organisation and no school admin can add one. Invitations: only the
  invited email can accept, acceptance creates the student record with its
  grade or the guardian link, expired and used tokens are refused, and issuing
  is an admin's instrument only. Courses are school-wide reads and
  author-scoped writes.
- **`sections`** — a teacher who creates a section is enrolled as its
  teacher; a student cannot create one; a term from another school is refused
  and `school_id` is derived rather than trusted. A teacher's reach is their
  own sections and not a colleague's, including rostering, and never extends
  to granting staff roles. Enrollment integrity: members only, a teacher
  cannot be enrolled as a student, students cannot enrol anyone. Section
  visibility: its students, staff, admins and the students' guardians, and
  nobody else.
- **`item-access`** — item bodies are hidden from non-members, locked by
  sequential order, opened by completion, not blocked by optional items, gated
  by prerequisite modules, and hidden when unpublished or archived. Staff and
  admins see everything; guardians see the catalogue, not bodies. The
  `module_item_catalog` view shows locked items without bodies or video URLs
  and refuses anonymous callers. Progress writes: a student can start and
  complete the open item and nothing locked, nothing in another section,
  nothing on another student's behalf, and cannot re-point a row at a locked
  item.
- **`completion`** — `section_enrollments.completed_at` is stamped by trigger
  when the last required item is done, ignores optional items, clears when
  progress is withdrawn, reopens when a required item is added, and is
  preserved or nulled for any hand-written value from a student, a teacher or
  an admin.
- **`visibility`** — profiles, student records, guardian links, live-session
  join links and notifications are each readable by exactly the right parties
  and writable by fewer.
- **`quiz`** — `is_correct` is unreadable through every path a student has;
  the section's teacher authors through their own session while a colleague
  cannot; no one, teacher included, can delete a question. Grading, recorded
  pass marks, exact-match multi-choice, foreign option ids, repeated question
  ids, archived questions, option-less questions, refusal for unenrolled
  students, guardians and locked items, and review access are all covered.
  Completion is covered from the other side: a student cannot stamp a quiz
  item complete through progress by insert or update, cannot un-complete a
  pass, and cannot insert or edit an attempt by hand.

- **`terms`** — terms and grading periods are readable by every member of
  the school and by nobody elsewhere, managed by its admins only, must end
  after they start, and a term with sections in it cannot be deleted.
- **`authoring`** — modules and items are added, edited and removed by the
  section's teacher, a co-teacher and the school's admin, and by no student,
  colleague or aide; a prerequisite must come from the same section and never
  the module itself. A teacher can rename or archive their section but only an
  admin can delete it; a section cannot be moved to another school's course,
  nor created by a direct insert that would bypass `create_section()`. A
  school's details and an organisation's are edited by their admins only, and
  a school admin cannot promote themselves to the organisation.
- **`membership-status`** — a dropped enrollment removes the section, its
  items and progress writes without erasing the row; a dropped teacher can
  neither manage nor see it; an inactive membership removes a person from the
  school (courses, the school row, admin powers), blocks enrolling them, and
  is reactivated by accepting a fresh invitation. Roles are per school for a
  person at two; signup copies the name from metadata; deleting the auth user
  cascades through the profile.
- **`schema-invariants`** — properties every migration must keep: RLS enabled
  and at least one policy on every public table, `search_path` pinned on every
  `SECURITY DEFINER` function, an anonymous caller seeing zero rows in every
  table even when every table has data, and `updated_at` maintained by
  trigger wherever the column exists.

Every negative test has a positive counterpart, so a blanket permission
failure cannot make the suite pass vacuously.

### Keeping the suite honest

Changes to authorization should be checked by weakening a policy and
confirming the suite fails. For example, dropping `can_access_item` from the
progress-insert policy must break *blocks completing a locked item*; relaxing
`can_manage_section` to any teacher at the school must break *is their own
sections, not a colleague's at the same school*; relaxing the
`staff read options` policy to `using (true)` must break both answer-key
tests; and granting `authenticated` delete on `quiz_questions` must break
*refuses even a teacher's direct delete*.

Three failures the baseline suite caught on its first run are worth knowing
about because they will recur in new helpers:

- A `SECURITY DEFINER` helper that returns `null` for a missing row passes
  `if not fn()` in PL/pgSQL. Helpers must `coalesce` to `false`.
- An integrity trigger that runs as the caller sees only the rows RLS lets
  the caller see, so a cross-school reference reads as "not found" instead of
  "refused". Integrity triggers are definer.
- A `STABLE` function sees the statement's snapshot, so a SELECT policy that
  calls `is_school_admin(id)` cannot see the membership inserted by the same
  statement. `INSERT … RETURNING` paths need a policy that checks the row's
  own columns.

Assert on rows, not on error text. A `WITH CHECK` violation raises; a `USING`
mismatch silently matches zero rows. Tests that assert refusal use
`returning id` and check both, which holds whichever layer does the refusing.
