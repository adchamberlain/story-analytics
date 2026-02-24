# Session Protocol

> Follow this protocol at the start and end of every Claude Code session working on the Datawrapper parity roadmap.

## At Session Start

1. **Read** `tasks/lessons.md` — internalize all learned patterns
2. **Read** `tasks/todo.md` — find next unchecked item
3. **Read** `DEV_LOG.md` (last 50 lines) — recent context
4. **Read** `docs/plans/2026-02-24-datawrapper-parity-plan.md` — implementation details for current task
5. **Check** `git status` — any uncommitted work from a previous session?
6. **Verify** dev servers are running: API on :8000, frontend on :3001

## Per-Feature Build Cycle

```
1. PLAN    — Enter plan mode if non-trivial (3+ steps or architectural decisions)
2. TEST    — Write failing backend pytest OR frontend Vitest test FIRST
3. BUILD   — Implement minimal code to make the test pass
4. VERIFY  — Run pytest + vitest + tsc --noEmit
5. SCREENSHOT — Capture UI at 1280px and 375px widths
6. REVIEW  — Read screenshots: does this look publication-ready?
7. STRESS  — Edge cases: empty data, huge datasets, unicode, dark mode, missing fields
8. FIX     — Address any issues (write test first, then fix)
9. COMMIT  — Atomic commit with descriptive message
10. TRACK  — Update tasks/todo.md (check off items)
11. LEARN  — Update tasks/lessons.md if anything was surprising
```

## Visual Quality Checklist (for screenshot review)

- [ ] Text is readable, not clipped or overlapping
- [ ] Colors contrast well in both light and dark mode
- [ ] Chart fills its container appropriately
- [ ] Axes are labeled and formatted correctly
- [ ] Legend (if shown) is aligned and readable
- [ ] No visual artifacts, stray lines, or misaligned elements
- [ ] Responsive: works at 1280px, 768px, and 375px widths
- [ ] Matches Datawrapper's polish level

## When a Bug Is Found During Build

1. **Stop** the current feature work
2. **Write** a failing test that reproduces the bug
3. **Fix** the bug
4. **Run** full test suite to confirm no regressions
5. **Commit** the bugfix separately (not mixed with feature work)
6. **Resume** the feature work
7. **Add** to tasks/lessons.md if it reveals a pattern

## Quality Gates (must ALL pass before checking off a task)

1. `python -m pytest api/tests/ -x --tb=short` — all pass
2. `cd app && npx vitest run` — all pass
3. `cd app && npx tsc --noEmit` — no type errors
4. Screenshots reviewed — UI looks publication-ready at desktop and mobile
5. Edge cases tested — empty data, large data, unicode, missing fields
6. Dark mode verified — screenshot in dark mode looks correct

## End of Session

1. **Update** `tasks/todo.md` with current progress
2. **Update** `DEV_LOG.md` with session summary (what was built, issues found, decisions made)
3. **Update** `tasks/lessons.md` with any new patterns
4. **Commit** all tracking files
5. **Leave** a clean git state (no uncommitted changes)

## How to Start a Session

Tell Claude:
```
Continue the Datawrapper parity roadmap. Read tasks/todo.md for current
progress, tasks/lessons.md for learned patterns, and
tasks/session-protocol.md for the workflow. Pick up the next unchecked
item and follow the build cycle.
```
