# MEDBIOHIM — реестр незавершённого, скрытых недоделок и legacy

Дата: 2026-10-08

Этот файл отражает текущее состояние после глубокого повторного аудита. Старые пункты, которые уже исправлены, явно помечены как CLOSED.

## Закрытые ранее найденные блокеры

| ID | Объект | Проблема | Статус |
|---|---|---|---|
| C-01 | HistologyTrainer.tsx | literal \\n ломал predeploy check | ✅ CLOSED |
| C-02 | frontend API | активные /api-compat/* вызовы | ✅ CLOSED |
| C-03 | Homework | production mock fallback | ✅ CLOSED |
| C-04 | Test bank → preparation | sequential flow не совпадал | ✅ CLOSED |
| C-05 | Preparation | structured options не поддерживались корректно | ✅ CLOSED |
| C-06 | Admin schedule | save через retired compat layer | ✅ CLOSED |
| C-07 | frontend shadow tree | frontend/ | ✅ REMOVED |
| C-08 | SpaceWeb shadow tree | spaceweb_upload/ | ✅ REMOVED |
| C-09 | dead mock data | src/lib/mock-data.ts | ✅ REMOVED |
| C-10 | dead UI | Sparkline.tsx | ✅ REMOVED |
| C-11 | chemistry fixture | chemistry/fixtures.ts | ✅ REMOVED |
| C-12 | legacy QuestionBank | JSON-backed QuestionBank.php | ✅ REMOVED |
| C-13 | admin question fallback | local JSON fallback | ✅ REMOVED |
| C-14 | fake empty admin overview | zero-count success on DB failure | ✅ FIXED |
| C-15 | progress fake numeric cards | degraded state could look like real zeros | ✅ UI hides numeric cards in degraded state |
| C-16 | Search → study plans | backend supported plan search but UI did not expose filter | ✅ FIXED |
| C-17 | subject hub filtering | tests/tickets/lectures could leak other subjects | ✅ FIXED |
| C-18 | subject progress | progress request was global | ✅ FIXED |
| C-19 | SRS | service/table/client/UI traces existed without complete storage | ✅ FIXED |
| C-20 | Search | backend service referenced but absent | ✅ FIXED |
| C-21 | Calculators | backend service referenced but absent | ✅ FIXED |
| C-22 | Presence | backend capability without persistent DB source | ✅ FIXED |

## Current remaining work

### R1 — production environment verification
Severity: P1

Code and CI are now substantially cleaner, but target-environment verification remains:
- Vercel latest deployment after latest commits;
- SpaceWeb latest backend deployment after latest backend commits;
- histology media physically present on SpaceWeb;
- trainer feed images return 200 rather than 404/502.

### R2 — AI provider availability
Severity: P1 / external dependency

Code chain exists, but actual provider availability depends on production credentials/network:
- GigaChat primary/fallback still needs verified runtime;
- Gemini requires the intended Vercel proxy path for RU-hosted backend;
- Mistral/OpenRouter/Groq may reject credentials/policy.

Это нельзя честно решить добавлением mock-провайдеров или fake responses.

### R3 — general document viewer
Severity: P2

Histology has a real in-site DOCX/image materials viewer. The generic /materials page still mainly renders converted content_html and external source links. The generic source metadata page exists but is currently not a primary navigation target.

Next action: route all supported document formats through the material viewer or explicitly mark generic viewer scope. Do not fake full-fidelity Word rendering where the backend has no physical document.

### R4 — admin CMS completeness
Severity: P2

Core admin editing is present, but full CMS still needs:
- material metadata editing;
- trainer card editing;
- lecture/body media editing beyond existing lecture CRUD;
- history/rollback UI for content versions;
- bulk validation operations.

These are feature-completion tasks, not hidden mocks.

### R5 — route consolidation
Severity: P2

Legacy/shadowed route handlers still coexist in several files:
- domain.php + domain_rest.php;
- admin.php + admin_rest.php;
- platform.php + dedicated REST routes;
- community_rest.php + platform.php;
- progress_rest.php + platform.php.

Они не являются заглушками, но duplicate registrations increase maintenance risk.

### R6 — learning_sessions generic layer
Severity: P2 / DEFERRED

learning_sessions has real DB rows and /sessions API, but current learning UI uses dedicated training/preparation endpoints. No active frontend consumer was found for generic session CRUD.

Keep for now; remove only after confirming no external/legacy deployment depends on it.

### R7 — content coverage is not a UI bug
Severity: P2 / content

Supabase has many intentionally empty activity/content tables:
- homework submissions;
- community posts;
- favorites/notes;
- SRS cards until users create them;
- AI messages until chat is used;
- Telegram tables;
- question reports;
- user subject/topic progress.

These are not to be filled with demo rows. They are expected to be zero for an unused feature.

## Current quality gates (reconciled 2026-10-10)

The items below distinguish historical source checks from the latest end-to-end release gate. Latest Actions runs `38011994749` (code checks), `38011994779` (smoke), and `38011994746` (backend archive) all ended with `steps: null`; commands did not produce actionable step results. Current CI is **blocked/unverified** regardless of older successful run records.

- 🟢 no active /api-compat calls in frontend (source audit);
- 🟢 homework runtime is API-only (source audit);
- 🟡 frontend escaped-newline, Next build, PHP syntax and route checks need a fresh executed run on current main;
- 🔴 smoke workflow currently blocked before steps; no current green claim;
- 🟢 dead shadow trees removed (historical source change);
- 🟡 target SpaceWeb media verification remains;
- 🟡 AI runtime provider verification remains;
- 🟡 database least-privilege migration is prepared but not applied; staging and post-migration privilege verification required.

## Definition of done for the remaining items

A remaining item can be marked ✅ only after:
1. implementation exists;
2. CI passes;
3. target environment responds correctly;
4. UI path is reachable from normal navigation;
5. no mock/demo data is used as production source-of-truth.

## Deep audit 3 closure — 2026-10-04

| ID | Finding | Result |
|---|---|---|
| D3-01 | shadowed domain route removal temporarily left malformed closure | ✅ fixed; backend PHP syntax green |
| D3-02 | legacy /admin/lectures/assist referenced missing service method and had no UI consumer | ✅ removed |
| D3-03 | legacy schedule PUT/local write routes | ✅ removed |
| D3-04 | duplicate admin schedule import route | ✅ removed |
| D3-05 | generic session frontend helpers had no current UI consumer | ✅ removed from frontend API |
| D3-06 | admin/settings query-param hook risk | ✅ replaced with client effect |
| D3-07 | admin content validator treated open ticket questions with empty answer as defects | ✅ validator corrected |
| D3-08 | Supabase published tests/test_questions/materials/trainer cards integrity | ✅ live check found no orphan test links, missing material files, or missing trainer image paths |
| D3-09 | generic material page showed no inline file preview | ✅ PDF/image inline preview added; other formats keep original-file action |
| D3-10 | mobile schedule default remained desktop grid | ✅ small screens now default to day/agenda view |

### Remaining external/product items

- Vercel production is behind current main and needs a successful deployment.
- SpaceWeb needs one final successful deploy run after code stabilizes.
- Histology media needs real target-environment B2/SpaceWeb smoke test.
- AI provider availability depends on runtime credentials/network.
- Dedicated polished editors and full visual version history remain product polish.


## Pass 38 — parallel cross-layer audit 2026-10-07

### U-38-01 — question-bank reconciliation
Severity: P1 / data integrity

Live schema currently reports 855 questions and 854 test_questions rows. Existing audit evidence indicates roughly 195 published/active question rows may be intentionally standalone or not linked to tests. This must be reconciled by category before any cleanup: standalone practice, archived/unpublished, ticket-bank content, intentionally unlinked, or accidental orphan. Do not auto-delete or relink.

### U-38-02 — exam_questions reconciliation
Severity: P1 / content integrity

Live schema reports 876 exam_questions. The count alone does not prove correct subject/topic/ticket coverage. Full reconciliation against Histology curriculum and the protected ticket banks remains unverified.

### U-38-03 — route shadow cleanup
Severity: P2

Source search confirms canonical REST files still coexist with legacy aggregate route files. No immediate functional regression was proven from source search; consolidation remains a maintenance-risk item.

### U-38-04 — unverified checks separated

Created docs/UNVERIFIED-CHECKS-2026-10-07.md. All checks requiring target runtime, browser/device, physical storage, provider credentials, or blocked aggregate SQL verification are kept there and must not be marked DONE from source inspection alone.

 
## U-2026-10-08 — Histology Lecture 05 learning UX release gate

Severity: P1 / runtime verification

Implemented:
- 6 database-backed inline mini-tests;
- canonical trainer photo ↔ text cards without manual caption duplication;
- contextual visual checkpoints instead of end-of-lecture photo wall;
- Atlas viewport-centered image lightbox with zoom/fullscreen fallback.

Still unverified:
- Vercel READY build after latest frontend commits;
- SpaceWeb deployment of `/questions/mini-quiz` and `/questions/mini-quiz/check`;
- authenticated iPhone Safari smoke;
- cross-page regression for other lectures/subjects;
- exact production media availability through SpaceWeb.

Do not mark this registry item closed from GitHub/Supabase code state alone.


## U-2026-10-08-02 — Явные кнопки ImageLightbox

Severity: P1 / runtime verification

Implemented:
- явная кнопка «Открыть на весь экран» на превью изображения;
- отдельные controls «Уменьшить / Увеличить / Сбросить / Полный экран / Закрыть»;
- fixed viewport modal и fallback для Safari без гарантии нативного Fullscreen API;
- масштаб до 300%.

Code commit: 7735ff1ccdc21b509ca6e61bb8267d81a3a1a4bf.

Still unverified:
- Vercel READY после этого commit;
- реальный iPhone Safari smoke;
- проверка всех atlas/trainer image entry points после deployment.

Не закрывать этот пункт только по состоянию GitHub: требуется target-runtime проверка.


## U-2026-10-08-03 — Atlas / Unified Media Viewer desktop + mobile correction

Severity: P1 / cross-platform UX

### Найдено
- Atlas использовал архитектуру card → legacy modal → ImageBox → ImageLightbox.
- Legacy modal ограничивал контент max-h-[90vh] и overflow-auto, поэтому изображение требовало прокрутки и не занимало viewport.
- Controls ImageLightbox находились только во втором уровне и фактически были недоступны пользователю в первом Atlas сценарии.
- Это не iPhone-only defect: та же архитектура воспроизводима на Windows/desktop.

### Исправлено в ветке fix/unified-media-viewer-desktop-mobile
- unified ImageLightbox: 100dvh, safe-area, явные controls, zoom до 500%, reset, close;
- desktop wheel + double-click + drag/pan;
- Pointer Events для touch/pinch;
- native Fullscreen API только как enhancement/fallback;
- Atlas direct entry через TrainerImageViewer, без внешнего scroll-modal;
- metadata/captions/material link перенесены внутрь unified viewer.

### Ещё не закрыто
- Vercel READY для этой ветки;
- SpaceWeb/API runtime media delivery;
- реальный Windows Chrome/Edge/Firefox/Yandex smoke;
- macOS Safari/Chrome smoke;
- iPhone Safari smoke;
- Android Chrome touch smoke;
- Lecture/Trainer/Materials cross-page regression;
- Materials photo/document modal architecture audit.

Не переводить в CLOSED/DONE до полного release gate.


## U-2026-10-08-04 — Viewer regression cleanup

В рамках Unified Media Viewer дополнительно найдено и исправлено:
- literal escaped `\\n` в `HistologyTrainerParts.tsx`, который мог ломать TSX parsing;
- unreachable legacy photo rendering внутри нового Materials document modal;
- отдельный `<img>` для image-file preview в Materials заменён на `ImageLightbox`;
- photo loading в Materials получил retry;
- blob/object URLs для document/PDF/image preview переведены на управляемый lifecycle.

Статус: исправлено в ветке `fix/unified-media-viewer-desktop-mobile`; runtime/build gate остаётся открытым.

## U-2026-10-08-05 — iPhone viewport / stacking regression found from runtime screenshot

Severity: P1 / mobile viewport

### Подтверждено по iPhone Safari screenshot
- viewer controls are present, but the viewer is physically constrained to the app content area;
- the fixed overlay does not cover the full device viewport;
- the mobile bottom navigation remains above the viewer;
- the image therefore appears too high/inside a shortened viewer instead of being centered in the full visible viewport;
- this proves that `fixed + z-index` inside the existing React tree is not sufficient for this app/runtime combination.

### Исправлено в ветке fix/unified-media-viewer-desktop-mobile
- `ImageLightbox` now renders the open viewer through `createPortal(..., document.body)`;
- viewer gets an explicit viewport-level z-index and `100vw` / visualViewport height;
- glass overlay/card colors are explicit inline RGBA values so the existing theme overrides cannot turn the viewer into an unintended dark surface;
- page scroll lock no longer re-runs on every zoom change;
- keyboard zoom uses a ref to avoid recreating the scroll-lock effect during zoom.

Code commit: `6655e65c94072fa91bc3b96c65745865698cd95f`.

### Release gate
Still required:
- deploy this exact commit;
- iPhone Safari: full-width/full-height viewer, image centered between header/footer, bottom navigation fully covered, no page scroll;
- pinch/pan/zoom/reset/fullscreen/close;
- desktop and Android regression;
- Lecture → Atlas → Trainer → Materials regression.

Do not mark this item DONE from source inspection alone.


2026-10-08 — additional launch blocker audit: found and fixed a literal `\\nuse` syntax artifact in `backend/config/routes/questions_rest.php` on the active viewer branch. This was a real PHP syntax blocker that could prevent the backend route set from loading. Commit: `b374a49fd03574806595064746d09c046a19778e`. The companion `HistologyTrainerParts.tsx` literal-newline issue is already clean on this branch. GitHub Actions currently fails before any job step/log is produced, so target syntax/build verification remains external/infrastructure-blocked.

## U-2026-10-08-06 — Schedule session reconciliation

Severity: P1 / academic-context integrity

Live audit found all 309 current `schedule_entries` had `session_id = NULL`, despite an unambiguous current academic session for the active group's course/date range.

Fixed:
- idempotent migration `20261008_reconcile_schedule_entries_current_session`;
- source-controlled migration in `database/migrations/20261008_reconcile_schedule_entries_current_session.sql`;
- live result: 309/309 entries have `session_id`, 0 remain without session;
- migration does not hardcode generated UUIDs and only fills entries when the current session/course/date match is unambiguous.

Still required: production API/browser smoke for schedule loading and create/edit homework flow.

## 2026-10-08 — launch-blocker sweep #2

Found and fixed another real frontend syntax blocker in `src/components/trainers/HistologyMaterials.tsx`: `createPortal(...)` had been incorrectly wrapped in `{...}` inside a JavaScript conditional expression. Commit: `aa4fcd4975da79f187969f6685caf891572b80bb`.

Additional source scan of all 12 files changed against `main` found no remaining literal-newline artifacts or malformed `{createPortal(...)}` patterns. The active branch remains `fix/unified-media-viewer-desktop-mobile`; no new branch created.

GitHub Actions continues to terminate both frontend/backend jobs before any step/log is produced (GitHub log artifact returns `BlobNotFound`), and Vercel continues to report the external build-rate-limit blocker. These are release-verification blockers, not a reason to invent a code workaround.


## Launch sweep — 2026-10-08

| ID | Проверка | Результат |
|---|---|---|
| LS-01 | Atlas/ImageLightbox constrained by parent stacking context | ✅ fixed: viewer portaled to `document.body`, explicit viewport sizing/z-index/safe-area |
| LS-02 | Generic Materials did not request physical file for non-Histology/file-backed records | ✅ fixed in `src/app/materials/page.tsx` |
| LS-03 | Material backend only served Histology source_path | ✅ fixed: canonical `public.files`/B2 path + Histology legacy fallback |
| LS-04 | Vercel proxy dropped backend media `Location` redirects | ✅ fixed; `location`/media headers are forwarded |
| LS-05 | Material client could not safely consume B2 302 as a URL | ✅ fixed: manual redirect handling returns presigned URL |
| LS-06 | Live duplicate `schedule_entries(session_id)` index | ✅ removed; single `idx_schedule_entries_session` remains |
| LS-07 | Live `file_variants` RLS called `auth.uid()` per row | ✅ migrated to `(select auth.uid())` form |
| LS-08 | All published Materials have a content source | ✅ live check: 80/80 have `content_sources.source_path`; 0 missing source |
| LS-09 | Published schedule entries without session | ✅ live check: 0/309 |
| LS-10 | Question/test integrity | ✅ live audit: no duplicate/orphan test-question links; no published tests without questions |

### Current hard launch blockers

1. Vercel target deployment of the exact current head is not available yet because of the platform build-rate limit.
2. SpaceWeb physical Histology files still require HTTP-level verification on the deployed backend.
3. Auth → schedule → tests/preparation → Materials/Atlas runtime smoke still requires the target environment.
4. AI provider health remains external and must be verified with production-safe credentials.
5. Generic full-fidelity document rendering for DOCX/PPTX remains a P2 feature gap; the fallback is an original-file link, not a fake in-browser Word renderer.

## 2026-10-07 — отдельный реестр непроверенного после Pass 37

### U-37-01 — target-runtime media capabilities
Проверить на фактическом SpaceWeb runtime PHP/GD/Imagick/WebP/AVIF через admin capabilities. Наличие кода не считать production-подтверждением.

### U-37-02 — реальный derivative E2E
На реальном B2/Histology изображении проверить processing endpoint, HTTP 200, MIME, размеры, checksum, `file_variants`, физический B2 object и неизменность original.

### U-37-03 — perceptual quality scoring
Текущий quality gate использует безопасные placeholder scores для generated candidates. Реальные text/detail/artifact measurements ещё не реализованы.

### U-37-04 — automatic worker/queue
Сейчас processing ручной. Очередь/worker ещё не подключены; нужен реальный runtime-механизм без fake async.

### U-37-05 — derivative consumption
Проверить Materials, Atlas, Trainer и Homework attachments: derivative при наличии, original fallback, mobile/desktop и основные браузеры.

### U-37-06 — video derivatives
Image processor не закрывает 1080p/720p/480p video pipeline. Нужен отдельный ffmpeg/ffprobe worker и compatibility validation.

### U-37-07 — EXIF/GPS stripping
Требование есть в media policy, но отдельная runtime-проверка результата ещё не выполнена.

### U-37-08 — physical media reconciliation
Полная сверка archive → SpaceWeb/B2 → DB files → file_variants → API → HTTP 200 ещё не завершена. Metadata-only наличие не считать доказательством.

### U-37-09 — regression after merge/deploy
PR #17 пока draft. Нужны CI green, target SpaceWeb smoke и frontend media smoke после стабилизации.

## Pass 38 — media quality implementation continuation — 2026-10-07

| Контур | Статус | Результат |
|---|---|---|
| Pixel quality analyzer | 🟢 source | added deterministic pixel-based contrast/detail/blocking measurements |
| Multiple candidates | 🟢 source | high + compact WebP/AVIF candidates generated when encoders exist |
| Placeholder scores | 🟢 removed | processor no longer writes hard-coded 1/1/0 quality scores |
| Content-aware selection | 🟢 source | candidates are scored before MediaQualityPolicy selection |
| Original | 🟢 | source binary remains untouched |
| Runtime encoder check | 🟡 | actual GD WebP/AVIF support still requires target runtime |
| Perceptual validation sample set | 🟡 | real histology/EM/text-heavy acceptance still requires browser/visual runtime check |

Important: the analyzer is an inexpensive deterministic gate, not a substitute for a human/benchmark visual acceptance test. The latter remains in docs/UNVERIFIED-CHECKS-2026-10-07.md.

## Pass 39 — runtime/integrity continuation — 2026-10-08

### Storage/media source correction
- 🟢 fixed double-escaped exception namespaces in `backend/config/routes/admin.php` for the new image-processing endpoint;
- 🟡 target-runtime PHP syntax/capability smoke is still required because GitHub Actions has no workflow run attached to the current branch head;
- 🟡 real B2 derivative E2E remains unverified.

### Live question/test integrity snapshot
Verified directly against Supabase:
- `questions`: 855 total;
- published, non-archived questions: 660;
- `tests`: 33 total;
- published, non-archived tests: 32;
- `test_questions`: 854 links;
- duplicate `test_id + question_id` pairs: 0;
- orphan test/question links: 0;
- published tests without questions: 0;
- published questions without tests: 0.

Subject breakdown:
- Histology: 673 published questions, 479 linked into tests, 9 published tests;
- Organic/physical chemistry: 176 published questions, 176 linked, 21 published tests;
- unscoped questions: 5 published, all linked, 2 published tests.

Histology test inventory currently includes:
- 206 questions — preparations/electronograms;
- 163 questions — cytology + embryology;
- 96 questions — cytology closed tests;
- 67 questions — embryology closed tests (**currently unpublished**);
- 41 questions — general embryology;
- 20 questions — blood;
- 20 questions — muscle tissues;
- 20 questions — epithelial tissues;
- 20 questions — cytology closed;
- 20 questions — embryology closed.

Important: no cleanup or deletion was performed from this audit. The 67-question unpublished test must be treated as an activation/product decision, not as an orphan or corruption finding.


### Pass 40 — smart grading exception-path audit — 2026-10-08
- 🟢 audited the shared `AnswerGradingService` integration in normal tests and preparation;
- 🟢 fixed namespace-qualified PHP exceptions in `TestRepository` (`RuntimeException` / `Throwable`) so error/retry/finish paths resolve global PHP classes correctly;
- 🟢 rechecked `preparation.php`: exception classes in the grading/retry paths are already globally qualified;
- 🟡 authenticated target-runtime E2E remains required: save answer → deterministic result, AI fallback, provider failure → stored unresolved state, regrade, finish;
- 🟡 browser verification remains required for the frontend's handling of unresolved/pending answers.


## U-2026-10-10-54 — Read-only question/test integrity reconciliation

Severity: P1 / data integrity

Latest read-only Supabase evidence:
- 854 `test_questions` rows; 0 duplicate (test, question) pairs; 0 broken links.
- 32 active published tests, 0 without questions.
- 660 active published questions, 0 without a test link.
- 776 published `exam_questions`; 0 blank prompts, 0 missing subject identity, 0 broken non-null module/topic links.
- 719 published blank answer fields group under open-ticket/preparation-style types. Treat as intentional until source/curriculum review says otherwise; do not bulk fill, unpublish, or delete.
- Five legacy Anatomy/Biochemistry question rows have valid subject IDs and links, but their subjects have NULL slugs. Canonical subject mapping remains a separate cleanup task.

Report: [DATA-INTEGRITY-RECONCILIATION-2026-10-10-PASS54.md](DATA-INTEGRITY-RECONCILIATION-2026-10-10-PASS54.md).

No database writes were made. CI runner and production/runtime checks remain blocked/unverified.


## U-2026-10-10-DB-PRIVILEGES — Client-role table grants need least-privilege review

Severity: P1 security / database hardening

Read-only audit observed effective `TRUNCATE`, `TRIGGER`, and `REFERENCES` privileges for `anon` and/or `authenticated` across many public base tables, plus permissive default ACLs for future tables. This does not alone prove a PostgREST exploit path, but the privileges are unnecessary for browser-facing roles; RLS does not govern TRUNCATE.

Prepared but NOT APPLIED: `database/migrations/20261010_revoke_non_rls_table_privileges.sql`.

Required before closure:
1. Review execution role and default-privilege ownership in staging.
2. Apply via approved migration process only after staging validation.
3. Recheck effective privileges for both client roles.
4. Smoke-test all required browser-facing read/write flows under anon/authenticated JWTs.

No production DB writes were made. Report: [DATA-SECURITY-INTEGRITY-WORKSTREAM-2026-10-10.md](DATA-SECURITY-INTEGRITY-WORKSTREAM-2026-10-10.md).


## U-2026-10-10-CI-MEDIA-TRACEABILITY — runner and Histology media delivery

Severity: P1 / release verification and learning-media availability

Evidence:
- Latest inspected Actions smoke job has `steps: null`; workflow source has expected triggers and checks, but no actionable runner output identifies a YAML command failure.
- 28 Histology electronogram cards have captions and imageUrl values, but all 28 have `source_file_id IS NULL`; five have source_key/imageUrl basename mismatches. Physical SpaceWeb/B2 existence is not proven.

Required next steps:
1. Owner checks GitHub Actions run details, usage/permissions and runner initialization; escalate to GitHub Support if the platform provides no logs.
2. Verify all 28 media objects read-only on SpaceWeb/B2 and issue authenticated HTTP checks for expected routes.
3. Only after confirming actual filenames, prepare a Histology-only correction for the five mismatches and test mobile/desktop trainer rendering.
4. Restore CI execution and run PHP lint/regression/route checks, frontend typecheck/build/predeploy audit; verify target deployment separately.

Report: `docs/CI-MEDIA-TRACEABILITY-WORKSTREAM-2026-10-10-PASS55.md`. Query: `database/audits/20261010_electronogram_asset_traceability.sql`.


## Quality-gate correction — 2026-10-10

Older pass notes below remain historical evidence only. Latest Actions runs `38011994749`, `38011994779`, and `38011994746` ended with `steps: null`; current CI is blocked/unverified and smoke is not currently claimed green. Re-run frontend build/typecheck, PHP lint/regressions, routes and predeploy once the runner executes. The least-privilege migration is prepared but unapplied.


## Pass 56 — database least-privilege + quality-gate reconciliation (2026-10-10)

Read-only effective privilege audit on PostgreSQL 17.6 (83 public base/partitioned tables): `anon` has MAINTAIN/TRUNCATE/REFERENCES/TRIGGER on 71 tables; `authenticated` on 78. The proposed migration now revokes all four privileges and adjusts default privileges for `postgres` and `supabase_admin`. It is still **not applied**. Added `database/audits/20261010_public_table_privilege_verification.sql` to verify the before/after state. Report: `docs/DATABASE-LEAST-PRIVILEGE-STATUS-RECONCILIATION-2026-10-10-PASS56.md`.

## U-2026-10-10-57 — CI runner initialization + privilege migration preflight

Latest retry of smoke run [38012180433](https://github.com/MISTACEN/medbiohim/actions/runs/38012180433), attempt 2, still ends before workflow steps (`steps: null`, no logs). Workflow YAML review does not identify a specific command-level failure. Root cause remains unknown and requires repository-owner Actions usage/permissions inspection or GitHub Support.

Read-only Supabase checks confirm default public-table ACLs exist for both `postgres` and `supabase_admin`; the committed migration covers both. PostgREST `authenticator` role membership is configured for explicit SET ROLE with inheritance disabled. No privilege migration has been applied; no production writes. Next: confirm staging + migration runner role, apply only in approved staging, run the verification audit and browser-role flow tests.

Report: [Pass 57 CI + DB preflight](CI-DB-PREFLIGHT-WORKSTREAM-2026-10-10-PASS57.md).

### Latest Pass 57 evidence update

After the docs-only commits, current-head Actions runs also failed before steps/logs: code-check `38012550501`, smoke `38012550519`, archive `38012550490`; code-check `38012554325` also has both jobs with `steps: null`. See [Pass 57 report](CI-DB-PREFLIGHT-WORKSTREAM-2026-10-10-PASS57.md). This reproduces across workflows and commits; no PHP/frontend test results exist yet.

## U-2026-10-10-58 — release-gate configuration and transport hardening

Severity: P1/P2. Source-only findings, not yet runtime verified:

- GitHub Actions code-check/smoke/archive jobs continue to fail before steps/logs, so checks are blocked.
- Frontend has no tracked package lockfile; `npm install` can resolve drift across builds. Generate a genuine lockfile in an environment with registry access, validate it, then use `npm ci`.
- `eslint.config.mjs` currently contains ignore patterns only and no recommended Next/TypeScript rules; `npm run lint` is not a meaningful gate.
- `next.config.ts` sets `typescript.ignoreBuildErrors: true`. The separate predeploy audit runs `npm run typecheck`, but it has not executed successfully in CI; remove the override only after type errors are actually remediated.
- `.github/workflows/deploy-backend.yml` disables FTPS certificate verification (`curl -k`, `ssl:verify-certificate no`). Validate SpaceWeb certificate/hostname on a trusted network, then enable verification and test read-only listing before deploying.
- Deployment backs up files but has no demonstrated tested rollback after partial upload.

No source runtime behavior, deployment, secret, or production database was changed in Pass 58. Report: [RELEASE-GATE-SOURCE-AUDIT-2026-10-10-PASS58.md](RELEASE-GATE-SOURCE-AUDIT-2026-10-10-PASS58.md).
