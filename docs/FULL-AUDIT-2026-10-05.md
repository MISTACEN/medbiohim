# MEDBIOHIM — FULL AUDIT 2026-10-05

## Scope
Three-pass audit of main, live Supabase, current Vercel deployment state, test/preparation flows, question reports, admin tooling, mobile UX, and CI/CD.

## Pass 1 — Frontend / feature wiring

### Verified
- `/tests` loads published tests and supports direct test, bank, preparation and exam entry points.
- `/tests/preparation/[id]` has sequential/full/count modes, resume state, background answer saves, final queue flush, result screen and AI review.
- `/tests/bank/[id]` has full-bank view, answer display, progress and admin quick-edit.
- `QuestionReport` is wired into the normal test flow and preparation flow.
- `QuestionReport` is now also wired into the full question-bank view.
- `/admin/problems` is the real report/problem center.
- `/admin` now exposes «Жалобы и ошибки» on mobile and desktop admin navigation.
- Report backend is registered at `/api/v1/questions/{id}/report` and admin problem-center routes are protected by admin role.
- Visible loading progress bar was added to test/preparation waits and report submission; answer clicks remain non-blocking and save in the background.

### Important correction found
The old roadmap said user question reports were TODO, but the implementation already existed. The missing part was consistent exposure from every test surface and visible wait feedback.

## Pass 2 — Live Supabase integrity

### Current live counts/checks
- Published tests: 33.
- Published active questions: 735.
- Test-question orphan links: 0.
- Homework subject orphans: 0.
- Attendance schedule-entry orphans: 0.
- Invalid preparation-session statuses: 0.
- In-progress preparation sessions: 5.
- Question reports currently stored: 0.
- Published test with zero active questions was found and repaired where canonical mappings were unambiguous.

### Test-link repair
Histology deduplication had archived questions that were still linked from published tests:
- `Цитология (закрытые тесты)`: 34 archived links were unambiguously relinked.
- `Эмбриология (закрытые тесты)`: 66 of 67 archived links were unambiguously relinked.
- `Цитология и эмбриология (все закрытые)`: 18 of 19 archived links were unambiguously relinked; one was already represented by an active canonical question and was left untouched.

After repair:
- `Цитология (закрытые тесты)`: 96/96 active.
- `Эмбриология (закрытые тесты)`: 66/67 active; 1 malformed legacy row remains for manual reconstruction.
- `Цитология и эмбриология (все закрытые)`: 162/163 active; 1 malformed legacy row remains.

No unresolved row was silently rewritten when the source data was ambiguous/malformed.

## Pass 3 — Deployment / CI / target environment

### Vercel
- Latest production deployment is being generated from current `main`; several recent deployments are queued/building because multiple commits were pushed during the audit.
- The last previously confirmed READY production deployment was `7e54dcbd...`.
- Direct runtime fetch through the connected Vercel integration is currently blocked by project/team authorization, so a fresh end-to-end browser smoke cannot be declared from the tool environment.

### GitHub Actions
- Current `main` runs are failing across code-check, smoke, package and SpaceWeb archive workflows.
- The available job metadata does not expose step logs, so the exact runner failure cannot be responsibly attributed to a source-code defect yet.
- This is a release blocker: production-ready status must wait for a green code-check/smoke or accessible logs proving the failures are infrastructure/tooling-only.

## Remaining real blockers

### P0
1. Resolve/inspect current GitHub Actions failures and get a green code-check.
2. Verify latest Vercel production deployment after the current queue drains.
3. Run authenticated login → tests → preparation → report → admin problem center smoke.
4. Verify SpaceWeb media 404/502 physically.

### P1
1. Reconstruct the two remaining malformed histology test questions instead of guessing.
2. Audit all published tests for semantic correctness, not only link integrity.
3. Finish AI provider runtime verification.
4. Finish generic DOCX/PDF viewer and remaining media polish.
5. Standardize visible loading feedback on remaining long-running pages outside tests/preparation.

### Database performance/security findings
Supabase advisor currently reports:
- leaked-password protection disabled;
- 44 unindexed foreign keys (performance INFO);
- 4 RLS init-plan warnings;
- 1 multiple-permissive-policy warning on `question_reports`.

These are not immediate functional blockers, but should be handled in the hardening pass.

## Definition of done for the next release
- GitHub code-check green.
- Vercel production READY on current `main`.
- SpaceWeb health and authenticated API smoke green.
- Test bank/preparation/exam/report/admin problem center end-to-end green.
- No published test has missing/archived question links except explicitly documented malformed legacy rows.
- No new runtime 404/502 on required media.