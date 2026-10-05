# MEDBIOHIM — FULL AUDIT 2026-10-05

## Scope
Three-pass audit of main, live Supabase, current Vercel deployment state, test/preparation flows, question reports, admin tooling, mobile UX, and CI/CD. A second hardening pass was also applied to live RLS policies and the public smoke workflow.

## Pass 1 — Frontend / feature wiring

### Verified
- `/tests` loads published tests and supports direct test, bank, preparation and exam entry points.
- `/tests/preparation/[id]` has sequential/full/count modes, resume state, background answer saves, final queue flush, result screen and AI review.
- `/tests/bank/[id]` has full-bank view, answer display, progress and admin quick-edit.
- `QuestionReport` is wired into the normal test flow and preparation flow.
- `QuestionReport` is also wired into the full question-bank view.
- `/admin/problems` is the real report/problem center.
- `/admin` exposes «Жалобы и ошибки» on mobile and desktop admin navigation.
- Report backend is registered at `/api/v1/questions/{id}/report` and admin problem-center routes are protected by admin role.
- Visible loading progress bar was added to test/preparation waits and report submission; answer clicks remain non-blocking and save in the background.
- Public smoke coverage was strengthened to check the main public pages plus `/api/v1/health`, `/api/v1/tests`, and `/api/v1/subjects`.

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
- `Цитология и эмбриология (все закрытые)`: 18 of 19 archived links were unambiguously relinked; one malformed legacy row remains for manual reconstruction.

After repair:
- `Цитология (закрытые тесты)`: 96/96 active.
- `Эмбриология (закрытые тесты)`: 66/67 active; 1 malformed legacy row remains for manual reconstruction.
- `Цитология и эмбриология (все закрытые)`: 162/163 active; 1 malformed legacy row remains for manual reconstruction.

No unresolved row was silently rewritten when the source data was ambiguous/malformed.

### RLS hardening pass
Applied live migrations:
- `harden_question_reports_and_trainer_rls_20261005`
- `harden_admin_rls_initplan_20261005`

Results:
- `question_reports` SELECT access was consolidated into one policy: reporter-or-admin.
- `trainer_feed_answers` now evaluates `auth.uid()` through a SELECT init-plan.
- `content_versions` admin SELECT uses an init-plan-safe `auth.uid()`.
- `admin_change_log` read/insert policies use init-plan-safe `auth.uid()`.
- Supabase performance advisor now reports **0 `auth_rls_initplan` findings**.
- The previous multiple-permissive-policy warning for `question_reports` was removed by policy consolidation.

Remaining DB advisor findings:
- leaked-password protection is still disabled;
- 44 unindexed foreign keys remain as performance INFO;
- 65 unused-index notices remain informational and are not being removed blindly because several belong to legitimate future/low-volume paths.

## Pass 3 — Deployment / CI / target environment

### Vercel
- The connected Vercel integration cannot currently resolve the `medbiohim` project/deployments for the MISTACEN team, so a fresh production READY state cannot be independently confirmed from the tool environment.
- The last previously confirmed READY production deployment remains `7e54dcbd...`.
- Therefore no current production-green claim is being made.

### GitHub Actions
- The repository contains separate code-check, smoke, SpaceWeb deployment, SpaceWeb archive, and source-package workflows.
- The smoke workflow was strengthened on main to cover public pages and public API surfaces.
- Current exact run status after the latest commits is still not independently exposed by the available connector endpoint; therefore a green CI claim is not made.
- A release remains blocked until code-check + smoke + backend deploy are visibly green.

## Remaining real blockers

### P0
1. Obtain a green GitHub code-check and smoke run on the stabilized main.
2. Verify Vercel production READY on the same stabilized commit.
3. Run authenticated login → tests → preparation → report → admin problem center smoke.
4. Verify SpaceWeb media 404/502 physically.

### P1
1. Reconstruct the two remaining malformed histology test questions from source material instead of guessing.
2. Audit all published tests for semantic correctness, not only link integrity.
3. Finish AI provider runtime verification.
4. Finish generic DOCX/PDF viewer and remaining media polish.
5. Standardize visible loading feedback on remaining long-running pages outside tests/preparation.

### P2
1. Add the 44 advisor-reported FK indexes selectively, prioritizing high-traffic tables instead of blindly indexing every historical FK.
2. Review unused indexes after real production traffic exists; do not delete them solely because the advisor has not observed use yet.
3. Continue CMS completeness: material metadata, trainer-card editing, richer lecture/media editing, version-history UI, bulk validation.
4. Reduce duplicate legacy route registrations only after endpoint-by-endpoint equivalence verification.

## Definition of done for the next release
- GitHub code-check green.
- Smoke green on the stabilized commit.
- Vercel production READY on the same commit.
- SpaceWeb health and authenticated API smoke green.
- Test bank/preparation/exam/report/admin problem center end-to-end green.
- No published test has missing/archived question links except explicitly documented malformed legacy rows.
- No new runtime 404/502 on required media.
- Supabase RLS init-plan findings remain at 0.
