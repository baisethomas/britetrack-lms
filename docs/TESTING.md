# Testing

Two suites, run by Vitest as separate projects.

| Command | What it covers | Needs a database |
| --- | --- | --- |
| `npm run test:unit` | Pure logic: redirect validation, streak counting, sequential-unlock derivation | no |
| `npm run test:db` | Every Postgres RLS policy, trigger, and admin RPC | yes |
| `npm test` | Both | yes |

## Unit tests

`lib/progress.ts` and `lib/safe-redirect.ts` hold the logic worth testing in
isolation; the data-fetching wrappers in `lib/data.ts` delegate to them. Time
is injected (`computeStreak(dates, now)`) so streak assertions are
deterministic.

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

- **Role assignment** — signup metadata can request `student` or `parent`
  only; `admin` is downgraded. Users cannot promote themselves.
- **Admin RPCs** — `admin_list_users` and `find_students_by_email` refuse
  students *and* anonymous callers (the NULL-role case).
- **Lesson content** — full `lessons` rows require enrollment plus sequential
  unlock; `lesson_catalog` exposes browsing metadata without content and is
  closed to anonymous callers.
- **Progress integrity** — students cannot complete locked lessons, lessons in
  courses they are not enrolled in, or lessons on another student's behalf.
- **Course completion** — `enrollments.completed_at` is derived by trigger,
  is not writable by students, and is cleared when a lesson is added.
- **Visibility** — drafts, live-session Zoom links, notifications, and
  parent-student links are each readable only by the right parties.
- **Quiz answer keys** — `is_correct` is unreadable through every path a
  student has: the sanitised views omit it and the base tables refuse direct
  reads. Grading, pass marks, exact-match multi-choice, foreign option ids,
  attempt forgery and review access are all covered.

Every negative test has a positive counterpart, so a blanket permission
failure cannot make the suite pass vacuously.

### Keeping the suite honest

Changes to authorization should be checked by weakening a policy and
confirming the suite fails. For example, dropping `can_access_lesson` from the
progress-insert policy must break *blocks completing a locked lesson*; relaxing
the live-session policy to `auth.uid() is not null` must break *hides Zoom
links from a signed-in user who is not enrolled*; and granting `authenticated`
select on `quiz_options` must break both answer-key tests.
