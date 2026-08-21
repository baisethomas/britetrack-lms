# BriteTrack LMS

A learning management system for programs where **students** take structured
courses, **parents** follow their children's progress, and **admins** manage
content and people.

Built as a single [Next.js](https://nextjs.org) App Router application on
[Supabase](https://supabase.com) (Postgres, Auth, RLS, Edge Functions), styled
with Tailwind CSS v4.

## Features

- **Role-based experience** — student, parent, and admin each get their own
  dashboard and navigation from one codebase.
- **Guided learning** — courses can unlock lessons sequentially, so the next
  step is always obvious. A "Continue learning" card resumes the current course
  at the first incomplete lesson.
- **Visible progress** — progress rings, per-course bars, and a Duolingo-style
  daily streak computed from lesson completions.
- **Focused course player** — lesson content (video/article/quiz/live session)
  with a curriculum rail, previous/next navigation, and one-tap "mark complete
  & continue".
- **Parents as first-class users** — linked to students by an admin; they see
  course progress and streaks, never credentials.
- **Admin tooling** — course/lesson authoring with draft → publish → archive
  lifecycle, user role management, bulk enrollment by pasted email list, and an
  overview dashboard (students, courses, enrollments, completion rate).
- **Quizzes** — single-answer and select-all questions with a per-lesson pass
  mark. Graded entirely in the database, so the answer key never reaches the
  browser; passing is what completes the lesson, and retakes are unlimited.
- **Live sessions** — Zoom meetings attached to courses; a webhook edge
  function verifies Zoom's HMAC signature and stores recording links
  automatically.
- **Notifications** — in-app notification center plus an edge function that
  fans out email via Resend.

## Architecture

```
app/                  Next.js App Router
  (auth)/             login, signup, onboarding
  (app)/              authenticated shell (sidebar, role-aware nav)
    dashboard/        student / parent / admin dashboards
    courses/          catalog, course detail, lesson player
    admin/            course authoring, users, bulk enrollment
lib/
  supabase/           browser/server/middleware clients (@supabase/ssr)
  actions/            server actions (auth, learning, admin)
  data.ts             shared server-side queries (progress, streaks, unlocking)
components/           UI primitives and shell
supabase/
  migrations/         schema + RLS policies (source of truth for access control)
  functions/          Deno edge functions (Zoom webhooks, notification emails)
```

There is **no separate API server**: authorization lives in Postgres RLS
policies, reads happen in server components, and writes go through server
actions. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning
and [`docs/UX_NOTES.md`](docs/UX_NOTES.md) for the design patterns the UI
follows.

## Getting started

1. Create a Supabase project and apply the migration:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

2. Configure environment variables (copy `.env.example` to `.env.local` and
   fill in your Supabase URL + anon key).

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Sign up as a student, then promote your account to admin once
   (`update profiles set role = 'admin' where id = '<your-user-id>';` in the
   SQL editor). Admins can manage every other role from the UI.

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
- `npm run test:unit` — pure logic (progress, streaks, redirect validation)
- `npm run test:db` — every RLS policy against a real Postgres
  (`npm run db:test:up` first)

Because authorization lives in Postgres rather than in application code, the
database suite is the one that matters most — see
[`docs/TESTING.md`](docs/TESTING.md).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, and the
build on every push and PR, plus the RLS suite against a Postgres service
container. Deploys are handled by Vercel's git integration.
