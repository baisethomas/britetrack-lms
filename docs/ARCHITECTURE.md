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

### Sequential unlocking is derived, not stored

A lesson is "locked" if the course has `sequential_unlock` and the previous
lesson (by `position`) is not completed. Deriving this from `lesson_progress`
at read time (`lib/data.ts:getLessonsWithState`) avoids an unlock-state table
that could drift when admins reorder or insert lessons.

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
```

`enrollments.completed_at` is stamped by the app when the last lesson of a
course is completed; the admin dashboard's completion rate reads it directly.
