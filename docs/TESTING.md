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

Every negative test has a positive counterpart, so a blanket permission
failure cannot make the suite pass vacuously.

### Keeping the suite honest

Changes to authorization should be checked by weakening a policy and
confirming the suite fails. For example, dropping `can_access_lesson` from the
progress-insert policy must break *blocks completing a locked lesson*; relaxing
the live-session policy to `auth.uid() is not null` must break *hides Zoom
links from a signed-in user who is not enrolled*.
