# UX notes — patterns behind the UI

The UI follows current LMS/education-app conventions, researched from
published LMS design guidance (the Mobbin MCP connector was not available in
the build environment, so patterns were sourced from the references below and
from well-known products they analyze — Duolingo, Coursera, Udemy).

## Patterns applied

**Continue-learning card (dashboard hero).** The single most useful action —
resume the current course at the next incomplete lesson — is the largest
element on the student dashboard, with a progress ring for context. Falls back
to an empty state that points at the catalog ("Start your first course")
rather than a blank screen.

**Visible progress everywhere.** Progress rings on dashboards, linear bars on
course cards and curriculum headers, checkmarks per lesson. Progress
indicators are among the most effective engagement mechanics: simple,
universally understood, and motivating.

**Streaks.** A Duolingo-style consecutive-day streak, shown on the student
dashboard and mirrored to parents. Kept lightweight (no freezes/leagues) —
appropriate for a program LMS rather than a consumer game.

**Sequential unlocking with clear affordances.** Locked lessons stay visible
in the curriculum (lock icon, muted text) so learners see the full path; the
next actionable lesson is always unambiguous. The unlock rule is stated in one
line under the curriculum.

**Focused course player.** Lesson content is the widest column; a slim
curriculum rail on the right handles orientation and navigation; "Mark
complete & continue" is the primary action, advancing momentum with one tap.

**Three-step role-aware onboarding.** Signup asks one question (student or
parent) with card-style radio buttons, then a single welcome screen explains
the three things that matter for that role. No multi-screen tour.

**Empty states that prompt action.** Every list (catalog, notifications,
children, admin courses) has an icon + one-line explanation + next step,
following the "empty states become prompts" onboarding guidance.

**Role-scoped navigation.** One shell, but students, parents, and admins each
see only their five-or-fewer destinations. Mobile gets the same nav in a
collapsed header rather than a separate app.

## References

- AnyforSoft — [How to design an LMS: best practices](https://anyforsoft.com/blog/lms-design/)
- Lazarev.agency — [LMS UX: designing learning platforms people want to use](https://www.lazarev.agency/articles/lms-ux)
- Appcues — [Onboarding UX patterns and examples](https://www.appcues.com/blog/user-onboarding-ui-ux-patterns)
- Riseapps — [LMS UI/UX design tips](https://riseapps.co/lms-ui-ux-design/)
- ProProfs — [LMS gamification](https://www.proprofstraining.com/blog/lms-gamification/)
- eLeaP — [Gamification in modern LMS platforms](https://www.eleapsoftware.com/glossary/gamification-in-lms-how-modern-learning-management-systems-drive-engagement-retention-and-performance-in-2026/)
- Research.com — [LMS trends](https://research.com/education/lms-trends)
