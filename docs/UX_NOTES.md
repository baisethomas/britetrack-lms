# UX notes — patterns behind the UI

The interface is modelled on how shipping education products actually solve
these screens. References were pulled from [Mobbin](https://mobbin.com) and are
cited inline so each decision can be traced back to the screens it came from.

## Design tokens

`app/globals.css` defines semantic tokens (`--surface`, `--text-muted`,
`--accent`, `--streak`, …) rather than letting components reach for raw palette
values. Components use `bg-raised`, `text-muted`, `border-line` and friends, so
theming is a matter of reassigning variables — which is what makes the dark
theme a single block of overrides instead of a per-component sweep.

Dark mode follows the OS by default and can be forced either way with
`data-theme="light" | "dark"` on the root element, so a user-facing toggle can
be added later without touching component code.

## Dashboard

References: [Uxcel](https://mobbin.com/screens/519c99ca-f49e-4509-b6db-57a74154d859),
[Coursera](https://mobbin.com/screens/18683325-d982-4756-b06e-4ed52c933b06),
[Codecademy](https://mobbin.com/screens/1c9ca0fe-bb9a-4753-b41d-c4ef4f3a375c),
[Babbel](https://mobbin.com/screens/a422a982-e18c-4b0a-9827-3edf3ddad400),
[Unity](https://mobbin.com/screens/90e21642-8418-4035-a9d7-336a1fff4eb3).

- **Named greeting as the page title.** Babbel ("Great to see you, Alex Smith")
  and Coursera both open this way, at display size.
- **A continue card per class as the dominant element**, carrying the course
  title, the section name, *the next item's name*, and the primary action.
  Uxcel and Coursera both surface the specific next step rather than only the
  course. Teachers get today's classes instead; guardians get one block per
  child; admins get a setup checklist until the school is running.
- **Time remaining next to percent complete.** Uxcel shows "6% · 7h left".
  Percent alone says how far you've come; time left answers the more useful
  question of whether you can finish now, so the card shows both.
- **The streak is a week strip, not a number.** Uxcel, Coursera, Codecademy and
  Brilliant all render seven day-chips with completed days filled in. A count
  cannot show *which* day was missed; the strip can, and today is ringed even
  when it is not yet complete.

## Section page

References: [Magnific](https://mobbin.com/screens/ba0ea65e-e838-45b1-a9e7-c513f4b02e63),
[Uxcel](https://mobbin.com/screens/02294a41-5e3c-4db8-9234-14e08e8b3dff),
[Podia](https://mobbin.com/screens/eadf9ce5-5d7c-4730-b06f-1078e461460e),
[Codecademy](https://mobbin.com/screens/aa6ef33d-ae53-4d25-a06a-5f53d3ccd9bb),
[Coursera](https://mobbin.com/screens/91b6f53c-c746-4cdf-a262-aa7929f30ae8).

- **The CTA and course facts live in a right rail** beside the syllabus, as on
  Magnific ("Start Learning" + 24 episodes / 1h 49min / Beginner) and Uxcel,
  rather than stacked above it.
- **Every item row carries its duration**, right-aligned — universal across
  the references, and the thing that makes an outline scannable.
- **The outline is grouped by module**, since a K-12 class is taught in units,
  with the module's unlock mode and prerequisite stated on the heading.
- **Locked items stay visible** with a padlock, as Podia does, so the whole
  path is legible before it is unlocked. The `module_item_catalog` view
  exists so a student can see a locked item's title without its body.

## Item page

References: [Coursera](https://mobbin.com/screens/24efcb48-835b-4dc8-acc4-a502cff8078a),
[Podia](https://mobbin.com/screens/8a156189-20c0-4b77-afa5-6dcb303fb99b),
[Squarespace](https://mobbin.com/screens/7662c6fb-b4b6-4b17-9e11-1bf889c9066b),
[Magnific](https://mobbin.com/screens/dc3ba845-27ec-4218-a999-90b79c841999),
[Skillshare](https://mobbin.com/screens/296cbc25-e43d-4a14-959d-ef91e20a46a5),
[MasterClass](https://mobbin.com/screens/53d71db7-abdf-4566-afa9-759d35cd7a8f).

- **A breadcrumb replaces the back link** (Coursera, Squarespace), so the
  class and the item are both addressable from the player.
- **Outline rows show state and duration**: check / play / circle / padlock,
  then the item length, as in Skillshare's "1. Introduction 1:50".
- **"Mark complete & continue" advances in one action**, matching Squarespace's
  "Complete & Continue". A quiz item has no such button: passing it is what
  completes it.
- **Live-session items are a join button**, not a page of instructions. The
  whole point of a live class in an LMS is that nobody hunts for the link.

## Onboarding and auth

References: [Babbel](https://mobbin.com/flows/332ff84d-d0f2-4669-bed6-7f1992729eb4),
[Codecademy](https://mobbin.com/flows/9e0051c2-a775-4a37-adcd-a9649df80a60),
[Brilliant](https://mobbin.com/flows/38a82b93-ec50-4c59-9a49-433a979ec59d).

- **Signup does not ask for a role.** Roles belong to a school, and the
  school grants them. Onboarding offers two cards instead — *Join a school*
  (paste an invitation) and *Set up a new school* — and an invitation link
  (`/join/<token>`) lands straight on the acceptance form with the choice
  already made.
- **Steps are large tappable cards, one idea each**, rather than a dense bullet
  list — the shape Babbel and Codecademy use for every onboarding question.
- **The school picker is in the shell, not in the flow.** A person at several
  schools switches from the sidebar; onboarding only ever sets up the first.

## Navigation

The sidebar collapses to a **bottom tab bar** below `md`, which is the standard
mobile pattern across the reference apps. It previously reused the desktop
list in a cramped header row.

## What was deliberately not copied

The references lean heavily on gamification the schema does not support and
a school does not want: XP totals and levels (Uxcel, Codecademy, Unity),
leagues and leaderboards (Uxcel), badges (Unity), and certificates (Uxcel,
Codecademy). Streaks were kept because progress data already implies them;
the rest would be inventing a scoring model rather than presenting real data.
What schools do want in their place — grades, attendance, announcements — is
the next two phases of `ROADMAP.md`.

## Grade bands (planned)

`students.grade_level` is stored from the first invitation so the interface
can adapt by band once Phase 3 arrives: larger targets, fewer words and
icon-first navigation for K-2; reading-level copy and a simpler item page for
3-5; the full layout from middle school. Nothing in the current UI branches on
it yet.
