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

## Pass 4 — user-reported runtime regression and correction (2026-10-05)

### Preparation mode
- Reproduced from the reported SQLSTATE: test_preparation_sessions_mode_check allowed only full and count while the UI/backend already supported sequential.
- Fixed live Supabase constraint to allow sequential.
- Added repository migration database/migrations/20261005_allow_sequential_preparation_mode.sql.
- Rechecked the live constraint: full | count | sequential.

### Global loading
- Added a global API request counter and loading bar in AppShell.
- Every request through the shared API client now reports active network work.
- The indicator has a short 140 ms delay so fast requests do not cause distracting flashes.
- Existing test/preparation/report-specific loading remains in place.

### Auth 401 hardening
- Shared API refresh is now deduplicated: simultaneous 401 responses cannot race the same rotating Supabase refresh token.
- App bootstrap can recover an expired access token from a valid refresh token before declaring the user logged out.
- This addresses the observed burst of 401s when the access token expires; an actually revoked/expired refresh token still correctly requires login.
- Admin lecture 401 for a non-admin remains expected authorization behavior.

### Subject/ticket 503 hardening
- Supabase REST academic and exam-question calls now retry transient transport/502/503/504 failures up to three times.
- No retry is performed for validation/auth errors.

### Supplied histology source archive
The uploaded Гистология.zip was inspected as the source-of-truth archive for histology content:
- 276 archive entries;
- 28 electronogram DOCX source files;
- 27 lesson scheme/table DOCX files;
- 5 test-source files;
- 9 methodical/manual source files;
- 178 preparation photographs.
The 28 electronogram source titles correspond to the 28 published histology / mbh / electronogram trainer cards in live Supabase, and their captions are present as preparation.captions.

### Malformed histology test link
- The two remaining malformed bird-blastula links were reconstructed from the supplied Cytology/Embryology source document rather than guessed.
- Canonical question: В результате дробления зиготы у птиц образуется.
- Source options restored in original order.
- The supplied source's answer key records option 2 (Целобластула); that source-derived answer was preserved and explicitly documented rather than silently replaced by external knowledge.
- Both affected published tests now point to the canonical reconstructed question.
- The duplicate malformed question remains archived.

### Current verification caveat
- Vercel deployment dpl_DNR82qnU3wvp9yWZiXsf5Mwpo for commit c36f1d... was independently confirmed READY in production.
- Subsequent commits are newer than that READY deployment; therefore the newest source tree still requires its own Vercel READY confirmation.
- Vercel runtime log access from the current connector is permission-denied, so SpaceWeb 401/503 runtime behavior cannot be declared fully closed solely from this environment.


## Pass 5 — Гистология.zip → текущий 3 семестр → UI/media (2026-10-05)

### Source inventory
- Supplied `Гистология.zip`: 276 archive entries; 28 EM source documents, 29 scheme/table entries, 7 methodical entries, 5 test-source entries, 178 preparation photographs, plus exam/control/specimen/memo materials.
- Existing DB for active 2nd-year semester-3 histology subject already contains all **80 non-photo source materials** from the ZIP: 28 EM + 52 other documents. Therefore the main defect was not absence of DB metadata: the old frontend filtered documents to `histology-em-*` and hid the other 52.
- Existing trainer set contains 206 published cards: 178 preparation photos + 28 EM. 38 cards have no current-plan topic; their names are skin/lung/uterus/bladder/kidney/testis/sperm/mammary/ovary plus urinary/reproductive/respiratory EM. They are next-semester material and are now excluded from the default 3rd-semester UI, not deleted.

### 3rd-semester scope
- Active semester-3 subject id: `977d78ca-7a58-4b0a-9e93-29d8e03f6946`; semester 4 is a separate subject row and is not mixed into the current UI.
- Current curriculum has 19 topics from week 1 through week 18.
- Materials now have plan links for the current scheme set and matching EM cards where a current topic exists. Next-semester scheme sources remain in DB but are hidden by default; an explicit “Весь курс” switch exposes them.

### UI fixes
- Histology Materials no longer filters documents to EM only.
- Added categories: Schemes/EM, Methodicals, Tests/Control, Exam, Preparation photos.
- Default view is 3rd semester; “Весь курс” exposes retained next-semester archive.
- Materials are grouped by curriculum topic when a plan link exists.
- Global input styling now prevents the black search field seen on iPhone/other browser themes.
- Legacy `.doc` sources get an HTML mirror path for in-site viewing; DOCX remains rendered client-side.

### Test/question cleanup
- Current published question bank: 286 questions after safe canonical deduplication; no published question is source-less.
- 14 exact duplicates with a canonical ZIP-backed question were rewired in test links and archived; 3 ambiguous malformed duplicate groups remain intentionally untouched for source review (“Полное, неравномерное, асинхронное” and “Амфибластула” groups).
- Duplicate 67-question embryology test was archived because all 67 linked questions are already present in the canonical mixed set; a separate 20-question embryology test remains.
- Previously source-less test records were assigned explicit source records pointing to the supplied 2007 cytology/embryology source document.
- The bird-blastula reconstruction remains source-derived and retains the supplied source answer; it is not silently corrected.

### SpaceWeb payload
- Generated `histology-spaceweb-docs-delta.zip` containing the document/gif portion of the supplied ZIP plus HTML mirrors for legacy `.doc` files. The archive is ~102 MB and contains 95 files. Existing `content.zip` media is preserved; the new delta does not replace the old 178-photo/EM content.
- Limitation: no direct SpaceWeb file-upload connector is available in this session, so the archive is prepared but cannot be physically copied into SpaceWeb from ChatGPT. It must be placed under `content/histology/` on SpaceWeb alongside the existing content.

### Verification state
- Several intermediate Vercel deployments failed on lint/type checks while the frontend changes were being iterated; the newest deployment for commit `8d4ff442...` was BUILDING at the last check. Do not treat production as verified until the newest deployment reaches READY and an authenticated mobile materials smoke test passes.


## Pass 6 — повторная проверка после production build (2026-10-05)
- First implementation attempt failed Vercel type/lint build checks. The materials component was simplified and re-typed conservatively.
- Final verification commit: `797a8b9db6c79555df6b2e90b24b607edb737337`.
- Vercel production deployment `dpl_AM6arA4NSN9E9RS7CRr33avwsbza` reached **READY** in `fra1`; aliases include `medbiohim.vercel.app`.
- GitHub combined Vercel status for the final commit is **success**.
- Live Supabase audit after cleanup: 80 published current-semester material rows with no missing source key; 273 published questions with no source-less published rows; 76 published exam questions; 5 untouched ticket banks; 8 published tests + 1 archived duplicate; 206 trainer cards total, of which 168 have current-plan topic bindings and 38 are retained as next-semester/unmapped content and hidden by default.
- Three intentionally ambiguous duplicate question groups remain for source review because the rows are malformed answer-like strings rather than safely reconstructable questions. They are not silently deleted.
- The 102 MB SpaceWeb document delta archive was generated separately; physical SpaceWeb upload is still outside available connectors.
