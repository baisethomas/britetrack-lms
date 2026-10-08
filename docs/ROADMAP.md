# Roadmap

BriteTrack is a K-12 learning management system meant to compete with Canvas,
Schoology and the LMS inside programs like K12/Stride. It is sold to schools
first and to districts once a school has adopted it. It must be easy for a
kindergartener, legible to a parent, and fast for a teacher.

This document is the phased plan. Each phase ends with something a school can
run; nothing in a later phase is a precondition for the one before it.

## Where the product started

The app was first scaffolded in Firebase Studio as a generic course site: one
flat `role` on each profile (admin / student / parent), a global course
catalogue with no notion of a school, lessons hanging directly off courses,
and admins enrolling students by pasting emails. None of that survives contact
with a school: a teacher must own *their* classes and nobody else's, a school
must be invisible to every other school, a course runs as several class
sections across terms, and content is grouped into units, not a single list.

Phase 1 replaced that model wholesale. The original migrations were never
applied to any live project, so the schema was reset to a single baseline
rather than migrated.

## Phase 0 — run it (owner's step)

Nothing in this repository has yet been executed against a real Supabase
project; the schema and its policies are proven only by the database suite in
`tests/db`. Before anything else:

1. Create a Supabase project and apply `supabase/migrations/00001_baseline.sql`
   (`npx supabase db push`).
2. Fill `.env.local` from `.env.example`.
3. Run the app, sign up, found a school on the onboarding screen, invite a
   teacher, a student and a guardian, and walk each role through a class.
4. Fix whatever that walk-through turns up before building on it.

## Phase 1 — baseline (this branch)

Done. The product now has the shape of a school.

- **Tenancy.** `organizations` (a district or an independent school) own
  `schools`; schools own `terms` and `grading_periods`. Every row the app
  reads is reachable only through a school the caller belongs to.
- **Scoped roles.** A person holds roles *per school* (`memberships`:
  school_admin, teacher, student, guardian, staff) and may be an admin of an
  organization. The same person can be a teacher at one school and a parent at
  another.
- **Invitations.** Admins invite by email; a token is bound to that address
  and sets up the student record (with grade level) or the guardian link on
  acceptance. Signup never asks for a role.
- **Courses and sections.** A course is catalogue content; a section is a
  class of it in a term with a roster. Teachers create their own sections and
  are enrolled as its teacher automatically. Co-teachers and aides are
  supported.
- **Modules and items.** Content is organised as modules (units) of items:
  pages, videos, quizzes, live sessions and links. A module unlocks freely or
  sequentially and may require a prerequisite module. Items can be optional.
- **Quizzes** carried forward from the earlier player: graded in the
  database, answer key never served while a quiz is open, attempts kept.
- **Live sessions.** Bring-your-own Zoom or Google Meet links on a section,
  with one-tap join for students and guardians.
- **Role-specific shells.** Admin, teacher, student and guardian each get a
  dashboard and navigation; a person with several roles sees the union.
- **RLS end to end.** Fifty policies and the database suite that proves them.

## Phase 2 — gradebook

The feature every school asks about first.

- `assignments` on a section with points, due dates, submission types
  (online text, file, quiz, external, none) and a grading period.
- `submissions` and `grades` with late/missing/excused states, comments, and
  a rubric option.
- Quiz attempts feed the gradebook automatically.
- Weighted categories per section; a grading-period and a running total per
  student.
- Teacher gradebook grid, student "my grades" view, guardian mirror of it.
- Grade export (CSV) so a school can move marks into its SIS by hand until
  Phase 4 syncs them.

## Phase 3 — the daily classroom

What makes it usable every day rather than once a week.

- **Attendance** per section meeting and per live session (join events
  recorded when a student taps Join).
- **Announcements** per section and per school, with the notification fan-out
  that already exists.
- **Discussions** on a section, threaded, teacher-moderated.
- **Calendar** across a student's sections, and the guardian view of all
  children's calendars.
- **Email delivery** for invitations and notifications (the edge function is
  there; wiring it to invitations is the gap).
- **Grade-band presentation.** Grade level is already on the student record;
  use it: larger targets, fewer words and icon-first navigation for K-2;
  reading-level copy and a simpler item page for 3-5; the full layout from
  middle school.

## Phase 4 — what districts require

Nothing here is glamorous, and all of it is on the procurement checklist.

- **OneRoster 1.2** import of schools, terms, classes, users and enrollments;
  Clever and ClassLink SSO on top of it.
- **LTI 1.3 / LTI Advantage** as a platform, so the content tools a district
  already licenses can be launched from a module item and return grades.
- **QTI** quiz import and export.
- **Audit log** of administrative and grading actions.
- **Consent and privacy**: COPPA parental consent on student records (date of
  birth is already stored), FERPA-shaped access review, data export and
  deletion per student.
- **Accessibility** audit to WCAG 2.2 AA, with a written VPAT.
- **District admin** screens over the organization: schools list, roll-ups,
  cross-school staff.

## Phase 5 — embedded classroom

Engageli, the live classroom in K12/Stride, requires four or more CPU cores
and 8 GB of RAM, runs only in Chrome and Edge, and is CPU-intensive because
every participant runs a full WebRTC client. That is the wrong budget for
Chromebooks, and it is why families find it unstable.

The plan is to keep bring-your-own Meet and Zoom through Phase 4 and then
embed a classroom built on an SFU-based service with a light client:

- **LiveKit** (open source, self-hostable, with a cloud offering) is the
  primary candidate; Cloudflare RealtimeKit is the alternative if operating
  media servers is not wanted.
- Audio-first by default; video at 360p with simulcast/SVC so the server, not
  the client, decides what each device receives; a per-device budget that
  turns off incoming video on weak machines before the call degrades.
- Attendance from the room's join and leave events; recording to the
  section's live session automatically.
- Media over QUIC is watched but not adopted; it is not ready for interactive
  classrooms.

## Not planned

- A separate API server. Postgres RLS is the authorization layer and server
  actions are the write path; see `docs/ARCHITECTURE.md`.
- Gamification beyond the streak (XP, leagues, badges). Schools want grades
  and attendance, not leaderboards.
- A marketplace of third-party courses. Content is the school's.
