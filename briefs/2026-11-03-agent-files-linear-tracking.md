# Brief: Linear tracking rule in agent files

**Project:** BriteTrack LMS
**Created:** 2026-11-03
**Status:** open

## Task

Add the Linear tracking rule below to this repo's agent instruction files: AGENTS.md (create it; the repo has none). Add it as its own section; keep any existing guidance in place. Touch nothing but agent instruction files.

Rule text (verbatim):

- Linear (workspace loomlogiclabs, team TBD — Baise to confirm) is the source of truth for work.
- Claim before you start: assign the issue to yourself (or note your agent name in a comment) and move it to In Progress. If an issue is already claimed or In Progress, don't touch it; pick another or ask.
- Every branch and PR includes the issue ID (e.g. TER-50) in its name and title.
- Any new bug, follow-up, or TODO found while working becomes a new Linear issue linked to the parent issue, filed before the session ends, not left in comments, code TODOs or notes.
- Status handoffs: the builder moves the issue to In Review when the PR is open; only the verifier (an agent that did not do the work) moves it to Verified after checking the evidence; only Baise moves it to Done.

Workflow-state note: as of 2026-11-03 the Linear teams (TER, LOO, SIM, GRA, TAB) have no "In Review" or "Verified" state (only Backlog, Todo, In Progress, Done, Canceled, Duplicate). Until Baise adds them, use the closest existing state (keep In Progress) and record "In Review" / "Verified" in an issue comment. Do not create states.

## Complete means

- [ ] AGENTS.md (create it; the repo has none) contain the rule above with team **TBD — Baise to confirm**
- [ ] The PR diff touches only agent instruction files
- [ ] All checks on the PR are green
- [ ] No Linear issue yet (team unknown); Baise to confirm the team

## Evidence required

- The PR link and its diff (file list showing only agent instruction files)
- Screenshot or link of the green checks

## Reserved for the operator

- merge
- deploy
- confirming the Linear team if marked unconfirmed/TBD

## Original intake

> Also, make sure the AGENT.md files note to track changes and new issues via Linear. I want to make sure there's no slippage

> Brief the Linear tracking rule into every repo's agent files

> For a multi-agent workflow, could we change that Linear rule?

> Go with the change to the Linear rule

## Notes from the CoS

One brief per repo, same rule everywhere, to stop work slipping outside Linear. No Linear team known; team is TBD until Baise confirms.
