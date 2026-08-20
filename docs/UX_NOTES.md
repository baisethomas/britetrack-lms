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
- **A continue-learning card as the single dominant element**, carrying a course
  tile, an eyebrow label, the course title, *the next lesson's name*, and the
  primary action. Uxcel and Coursera both surface the specific next lesson
  rather than only the course.
- **Time remaining next to percent complete.** Uxcel shows "6% · 7h left".
  Percent alone says how far you've come; time left answers the more useful
  question of whether you can finish now, so the card shows both.
- **The streak is a week strip, not a number.** Uxcel, Coursera, Codecademy and
  Brilliant all render seven day-chips with completed days filled in. A count
  cannot show *which* day was missed; the strip can, and today is ringed even
  when it is not yet complete.

## Course detail

References: [Magnific](https://mobbin.com/screens/ba0ea65e-e838-45b1-a9e7-c513f4b02e63),
[Uxcel](https://mobbin.com/screens/02294a41-5e3c-4db8-9234-14e08e8b3dff),
[Podia](https://mobbin.com/screens/eadf9ce5-5d7c-4730-b06f-1078e461460e),
[Codecademy](https://mobbin.com/screens/aa6ef33d-ae53-4d25-a06a-5f53d3ccd9bb),
[Coursera](https://mobbin.com/screens/91b6f53c-c746-4cdf-a262-aa7929f30ae8).

- **The CTA and course facts live in a right rail** beside the syllabus, as on
  Magnific ("Start Learning" + 24 episodes / 1h 49min / Beginner) and Uxcel,
  rather than stacked above it.
- **Every lesson row carries its duration**, right-aligned — universal across
  the references, and the thing that makes a syllabus scannable.
- **The next actionable lesson is marked** with an "Up next" / "Start here"
  badge, following the "Start" pill Uxcel places on the current lesson.
- **Locked lessons stay visible** with a padlock, as Podia does, so the whole
  path is legible before it is unlocked.

## Lesson player

References: [Coursera](https://mobbin.com/screens/24efcb48-835b-4dc8-acc4-a502cff8078a),
[Podia](https://mobbin.com/screens/8a156189-20c0-4b77-afa5-6dcb303fb99b),
[Squarespace](https://mobbin.com/screens/7662c6fb-b4b6-4b17-9e11-1bf889c9066b),
[Magnific](https://mobbin.com/screens/dc3ba845-27ec-4218-a999-90b79c841999),
[Skillshare](https://mobbin.com/screens/296cbc25-e43d-4a14-959d-ef91e20a46a5),
[MasterClass](https://mobbin.com/screens/53d71db7-abdf-4566-afa9-759d35cd7a8f).

- **The curriculum rail sits on the left.** Coursera, Podia, Squarespace and
  Magnific all place it there; the rail moved from right to left to match.
- **The rail header states where you are** — course title plus "N of M
  completed" and a progress bar, as Podia does with "1/5 completed".
- **Rail rows show state and duration**: check / play / circle / padlock, then
  the lesson length, as in Skillshare's "1. Introduction 1:50".
- **A breadcrumb replaces the back link** (Coursera, Squarespace), so the
  course and lesson are both addressable from the player.
- **"Mark complete & continue" advances in one action**, matching Squarespace's
  "Complete & Continue"; previous/next controls sit below the content as in
  Magnific.

## Onboarding and auth

References: [Babbel](https://mobbin.com/flows/332ff84d-d0f2-4669-bed6-7f1992729eb4),
[Codecademy](https://mobbin.com/flows/9e0051c2-a775-4a37-adcd-a9649df80a60),
[Brilliant](https://mobbin.com/flows/38a82b93-ec50-4c59-9a49-433a979ec59d).

- **Role is chosen first.** Brilliant opens with "I'm a learner" / "I'm a parent
  or teacher"; signup asks student-or-parent the same way, as two option cards.
- **A progress bar sits above the flow**, as in Babbel and Codecademy, so the
  onboarding step reads as finite.
- **Steps are large tappable cards, one idea each**, rather than a dense bullet
  list — the shape Babbel and Codecademy use for every onboarding question.

## Navigation

The sidebar collapses to a **bottom tab bar** below `md`, which is the standard
mobile pattern across the reference apps. It previously reused the desktop
list in a cramped header row.

## What was deliberately not copied

The references lean heavily on gamification the schema does not support and
this product does not need: XP totals and levels (Uxcel, Codecademy, Unity),
leagues and leaderboards (Uxcel), badges (Unity), and certificates (Uxcel,
Codecademy). Streaks were kept because progress data already implies them;
the rest would be inventing a scoring model rather than presenting real data.
