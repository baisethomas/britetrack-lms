# BriteTrack LMS

A K-12 learning management system built to compete with Canvas, Schoology and
the platforms inside online programs like K12/Stride. Sold to schools first,
then to districts. Designed to be easy for a kindergartener, legible to a
parent, and fast for a teacher.

One [Next.js](https://nextjs.org) App Router application on
[Supabase](https://supabase.com) (Postgres, Auth, row-level security, edge
functions), styled with Tailwind CSS v4.

## What it does today

- **Schools as tenants.** An organization (a district, or a single
  independent school) owns schools; schools own terms and grading periods.
  Nothing crosses a school boundary.
- **Roles per school.** A person is an admin, teacher, student, guardian or
  staff member *at a school*, and can hold different roles at different
  schools. Signup never asks for a role; admins invite people by email and the
  invitation sets up the student record (with grade level) or the guardian
  link.
- **Courses and class sections.** A course is catalogue content; a section is
  a class of it in a term with its own roster. Teachers own their sections and
  nobody else's.
- **Modules and items.** Content is organised in units of pages, videos,
  quizzes, live sessions and links. Units unlock freely or in order and can
  require a prerequisite unit; items can be optional.
- **Quizzes graded in the database.** The answer key never reaches the
  browser while a quiz is open; passing is what completes the item.
- **Live classes.** Bring-your-own Zoom or Google Meet links on a section
  with one-tap join; Zoom recordings land on the session automatically.
- **Four dashboards.** Admin (setup checklist, people, catalogue), teacher
  (today's classes, rosters, building), student (what's next, streak, live
  classes) and guardian (every child, every class, what's coming up).
- **Authorization in Postgres.** Fifty RLS policies and a database test suite
  that proves each one against a real Postgres.

The phased plan from here (gradebook, attendance, OneRoster/LTI, an embedded
classroom) is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Layout

```
app/
  (auth)/             login, signup, onboarding (found a school / accept an invitation)
  join/[token]        invitation landing
  (app)/              authenticated shell: school picker, role-aware nav
    dashboard/        admin | teacher | student | guardian
    classes/          my sections → section → items (player, quiz, editor, build)
    children/         guardian view
    admin/            school & terms, course catalogue, people & invitations
lib/
  data.ts             getContext(), outlines, rosters, sessions, children
  progress.ts         unlock derivation (mirrors the database), streaks
  actions/            auth, onboarding, school, sections, learning, quiz
  supabase/           browser / server / middleware clients
components/           UI primitives, shell, outline, session list
supabase/
  migrations/         00001_baseline.sql — the schema and every policy
  functions/          Zoom recording webhook, notification emails
tests/
  unit/               pure logic
  db/                 RLS, triggers and RPCs against real Postgres
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning,
[`docs/TESTING.md`](docs/TESTING.md) for the database suite, and
[`docs/UX_NOTES.md`](docs/UX_NOTES.md) for the design patterns.

## Getting started

1. Create a Supabase project and apply the baseline:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and anon
   key.

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Sign up, then on the onboarding screen **found your school**. That makes
   you its administrator. Invite a teacher, a student and a guardian from
   **People**; each invitation produces a `/join/<token>` link bound to that
   email address (email delivery is a later phase; copy the link for now).

### Edge functions

```bash
npx supabase functions deploy send-notification-emails
npx supabase functions deploy process-zoom-webhooks
npx supabase secrets set RESEND_API_KEY=... ZOOM_WEBHOOK_SECRET_TOKEN=...
```

## Development

- `npm run dev` — local dev server
- `npm run lint` — ESLint (flat config, Next presets)
- `npm run typecheck` — strict TypeScript
- `npm run build` — production build
- `npm run test:unit` — pure logic
- `npm run test:db` — every RLS policy against a real Postgres
  (`npm run db:test:up` first, or point `DATABASE_URL` at any disposable
  Postgres 16 whose name contains the word `test`)
- `npm test` — both

Because authorization lives in Postgres rather than in application code, the
database suite is the one that matters most.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests and the build
on every push and pull request, plus the database suite against a Postgres
service container.
