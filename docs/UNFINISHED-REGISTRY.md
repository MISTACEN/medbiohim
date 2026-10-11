# MEDBIOHIM — реестр незавершённого, скрытых недоделок и legacy

Дата: 2026-10-10

Этот файл отражает текущее состояние после глубокого повторного аудита. Старые пункты, которые уже исправлены, явно помечены как CLOSED.

## Latest handoff — Pass 65–73 (2026-10-10)

- Current continuation report: [CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md](CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md).
- All six workflows now declare `permissions: contents: read`; this reduces token scope but did not restore Actions execution.
- Pass 69 fixed malformed indentation in `.github/workflows/package-archives.yml`; GitHub now recognizes the workflow and creates a `package` job. The job still fails before steps.
- Latest runs [code checks 38025017750](https://github.com/MISTACEN/medbiohim/actions/runs/38025017750), [smoke 38025017788](https://github.com/MISTACEN/medbiohim/actions/runs/38025017788), [SpaceWeb archive 38025017818](https://github.com/MISTACEN/medbiohim/actions/runs/38025017818), and [source package 38025017740](https://github.com/MISTACEN/medbiohim/actions/runs/38025017740) fail before visible steps. Raw package job confirms `runner_id: 0`, empty runner name and no steps. Raw jobs show `runner_id: 0`, empty runner name, no steps and no logs.
- **Release gate remains BLOCKED/UNVERIFIED.** Owner-side GitHub Actions settings/runner provisioning and potentially GitHub support are required before source-level CI failures can be evaluated.
- Archive secret-exclusion guards remain committed but untested by a running job. No deployment or production database write occurred. No deployment or production database write occurred.


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


## U-2026-10-10-59 — GitHub Actions jobs fail before exposing steps

Severity: P1 / release verification

Latest inspected head `8bb7f04320b0e497a7035a85545073dc26a69df7` produced failures in four workflows: code-check run [38013074629](https://github.com/MISTACEN/medbiohim/actions/runs/38013074629), smoke [38013074634](https://github.com/MISTACEN/medbiohim/actions/runs/38013074634), backend archive [38013074669](https://github.com/MISTACEN/medbiohim/actions/runs/38013074669), source package [38013074655](https://github.com/MISTACEN/medbiohim/actions/runs/38013074655). The Jobs API returns `steps: null` for all inspected jobs. No command-level failure can be diagnosed from this evidence, and no test command is confirmed to have executed.

Required: owner checks Actions service/usage/permissions and runner initialization; escalate to GitHub Support with run IDs if steps/logs remain absent. Then run frontend typecheck/build/predeploy audit, PHP lint/regression/route tests, and target smoke. Lockfile and ESLint improvements remain pending a registry-enabled environment and executable checks.

No production deployment, secret change, or database write was performed. Report: [Pass 59](CI-RUNNER-RECONCILIATION-2026-10-10-PASS59.md).


## U-2026-10-10-60 — CI queue churn from documentation-only commits

Severity: P2 / CI efficiency

Added Markdown-only path filters to `.github/workflows/code-check.yml` (push and pull_request), `smoke.yml` (push only), `package-archives.yml`, and `build-spaceweb-archive.yml`. Manual dispatch and scheduled smoke remain enabled. This avoids starting repeated jobs for docs-only commits; changes that include source/workflow files still trigger relevant checks.

Execution of the filters has not yet been confirmed. The separate Actions initialization issue remains open; latest prior jobs had `steps: null`. Report: [Pass 60](CI-DOCS-ONLY-FILTERS-2026-10-10-PASS60.md). No production changes were made.


### Pass 60 follow-up evidence
The workflow-definition commits themselves triggered runs as expected. Latest inspected runs: code-check [38013521893](https://github.com/MISTACEN/medbiohim/actions/runs/38013521893), smoke [38013522004](https://github.com/MISTACEN/medbiohim/actions/runs/38013522004), package [38013521967](https://github.com/MISTACEN/medbiohim/actions/runs/38013521967), backend archive [38013522082](https://github.com/MISTACEN/medbiohim/actions/runs/38013522082). All jobs still expose `steps: null`. The newer run list contains no runs for the subsequent Markdown-only status commits, consistent with path filters reducing docs-only churn. Runner failure remains unresolved.


## U-2026-10-10-61 — Actions job records/log blobs are absent

Severity: P1 / release verification

For code-check run [38013521893](https://github.com/MISTACEN/medbiohim/actions/runs/38013521893), backend job `114098661992` and frontend job `114098662106` have `steps: null` and `logs_url: null`; explicit step endpoint returns an empty list and log download returns HTTP 404 `BlobNotFound`. Repository metadata shows the repository is private, active, and integration permissions include admin/maintain/push. Root cause remains unknown; no test command is confirmed to have executed.

Owner action: inspect the run/job in GitHub UI, Settings → Actions → General, account usage/limits and service incidents; escalate to GitHub Support with runs `38013521893`, `38013522004`, `38013521967`, `38013522082` if no logs are available. Report: [Pass 61](CI-JOB-LOG-DIAGNOSTICS-2026-10-10-PASS61.md).


## U-2026-10-10-62 — Vercel runtime/build log visibility

Severity: P1 / release verification

The production alias `medbiohim.vercel.app` was rechecked and resolves to a READY deployment for commit `f5a5bb2efe7f5297e7c888a13b284dfd88b53160`. Vercel runtime-log query returned HTTP 403 `forbidden`; deployment event logs returned 404 `Deployment not found`. These are access/endpoint failures, not evidence that production has no errors.

Required: inspect build logs in Vercel dashboard, restore runtime-log API access or use authorized CLI/dashboard, then run public and authenticated runtime smoke. Report: [Pass 62](VERCEL-RUNTIME-OBSERVABILITY-2026-10-10-PASS62.md).


## U-2026-10-10-63 — ESLint config presence is not lint coverage

Severity: P2 / quality gate

The pre-deploy audit now warns when the discovered ESLint flat config contains neither a `rules:` block nor recognizable Next.js/TypeScript/recommended preset markers. This is a heuristic signal, not proof of complete lint coverage. The current config was observed to contain only ignore patterns, so `npm run lint` should not be treated as a meaningful gate until a baseline config is added and findings are remediated.

Validation remains blocked by GitHub Actions jobs failing before steps/logs. No local lint run or successful CI result is claimed. Report: [Pre-deploy audit/status reconciliation](PREDEPLOY-AUDIT-STATUS-RECONCILIATION-2026-10-10.md).


### CI retry after Pass 63 source change
Latest runs for commit `09ca10a746c508e0b3ad2643fff3fbba5d2fba87`: code checks [38019157502](https://github.com/MISTACEN/medbiohim/actions/runs/38019157502), smoke [38019157491](https://github.com/MISTACEN/medbiohim/actions/runs/38019157491), backend archive [38019157478](https://github.com/MISTACEN/medbiohim/actions/runs/38019157478), package [38019157470](https://github.com/MISTACEN/medbiohim/actions/runs/38019157470). Every job still has `steps: null` and `logs_url: null`; root cause remains external/unknown and no test result is confirmed. See [Pass 63 reconciliation](PREDEPLOY-AUDIT-STATUS-RECONCILIATION-2026-10-10.md).


## U-2026-10-10-64 — archive secret exclusion is source-only until CI runs

Severity: P1 / security hygiene

Source and backend archive workflows now exclude root/nested `.env*` paths and inspect the ZIP listing before artifact upload. However, latest GitHub Actions runs still fail before steps/logs, so the guard and ZIP contents have not been executed/verified. Keep this item open until a successful artifact build confirms no environment files are included.

See [Pass 64 report](ARCHIVE-SECURITY-AND-PASS-INVENTORY-2026-10-10-PASS64.md).


Latest retry confirmation: code-check run [38019548725 attempt 2](https://github.com/MISTACEN/medbiohim/actions/runs/38019548725) again failed with no job steps/logs for both backend and frontend. CI root cause remains open.


### Pass 77 update — archive fail-fast
- `.github/workflows/build-spaceweb-archive.yml` now uses `set -euo pipefail` before removing/copying/packing files (commit `4d37b00438ebfe4a73291e1176e942f0da8f00f1`).
- **Verification status:** committed, but not executed in CI because latest jobs terminate before any steps. GitHub Actions runner/job provisioning remains an open release gate.


### Pass 78 update — account preferences regression
- Added `backend/tests/AccountSettingsPreferencesTest.php`; it checks the `getPreferences()` contract and no-user defaults. Wired into code checks and deployment preflight.
- Static inspection finds `getPreferences()` in current `AccountSettingsService.php`; the prior fatal is not currently visible in source, but regression coverage is now committed.
- Still blocked: CI runs `38035609359`, `38035609394`, `38035609378`, `38035609353` fail before steps with no logs. The test is committed but not executed.

## Product and integration contract — 2026-10-11

Canonical source: [MEDBIOHIM product intent and integration contract](MEDBIOHIM-PRODUCT-INTENT-AND-INTEGRATION-CONTRACT.md).

Track these as open until implementation and verification:
- [ ] Align homework-create UI/API with the requirement that any authenticated member of the same group can add a shared assignment; keep server-side membership and academic-scope checks.
- [ ] Make PHP Telegram webhook secret verification reject requests when the secret is absent or empty; add regression coverage.
- [ ] Reconcile the Node Telegram bot and PHP group-ingestion service into one documented, idempotent end-to-end flow.
- [ ] Implement and verify secure Telegram account linking/registration and launch of the existing site as a Telegram Mini App; validate Telegram-signed initialization data on the server.
- [ ] Keep group homework separate from each student's personal completion/submission.
- [ ] Preserve provenance/versioning for imported real questions and clearly label AI-generated or unverified content.
- [ ] Define preview/confirmation for future browser-extension imports after access and rights review.
- [ ] Preserve the current approved site structure; no global redesign without explicit request.

Do not mark these complete from documentation or source presence alone. GitHub Actions runner initialization remains blocked in the latest observed runs; verify actual test execution.

## Pause hand-off snapshot — 2026-10-11

Read [the full MEDBIOHIM project checkpoint](STATUS-2026-10-11.md) before resuming. It contains the last pass, CI blocker, architecture, known issues, and ordered continuation plan.

## Перед паузой: полный снимок состояния — 2026-10-11
См. [PROJECT-CONTROL-SNAPSHOT-2026-10-11.md](PROJECT-CONTROL-SNAPSHOT-2026-10-11.md) для полной карты продукта, изменений, незавершённых задач, CI-блокера и безопасной очередности работ.

### Telegram group relay — source added 2026-10-11
- [x] Node webhook can relay group/supergroup updates over HTTPS to the existing PHP `/api/v1/telegram/webhook` endpoint when `TELEGRAM_HOMEWORK_WEBHOOK_URL` is configured.
- [x] Relay uses the configured shared webhook secret and rejects non-HTTPS target URLs; Node remains the single Telegram `setWebhook` destination.
- [x] Added tests for successful relay and the not-configured fallback.
- [ ] Configure the real PHP endpoint and matching server-side secrets, map the Telegram group in the database, and verify ingestion end-to-end. No production secrets or webhook settings were changed.
- [ ] Run Node/PHP tests on a functioning GitHub runner. Latest observed jobs fail within about three seconds with `runner_id=0`, empty `runner_name`, and `steps=[]`; logs are unavailable. This points to runner provisioning/account configuration rather than a failing test step, but the exact GitHub-side cause is not visible through the current connection.

## Implementation update — 2026-10-11

Completed in source, pending runtime/CI proof:
- [x] Changed PHP Telegram webhook secret matching to fail closed and added a pure regression test wired into code-check.
- [x] Removed the starosta-only gate from non-staff shared homework creation; the server still requires membership in the requested/active group.
- [x] Exposed homework creation to authenticated students in the existing schedule UI without widening unrelated management controls.

Still open:
- [ ] Run `php backend/tests/TelegramWebhookSecretTest.php` and the full backend/frontend checks on an actual runner; Actions has been blocked before steps.
- [ ] Validate student from own group can create homework and a non-member cannot, including subject/schedule ownership and attachments.
- [ ] Test Telegram webhook against real Telegram using a newly configured secret; do not expose tokens in logs.
- [ ] Implement secure Telegram account linking/registration and existing-site Mini App entry; current code is not yet accepted as end-to-end complete.

### Hosting resilience — planned, not deployed (2026-10-11)
- [x] Record primary/secondary/emergency hosting architecture and cost constraints.
- [x] Record current stack must remain primary; no broad migration.
- [ ] Profile the existing Vercel → SpaceWeb/PHP/API/media latency and establish a baseline.
- [ ] Verify current official free-tier limits and no-card requirements for shortlisted providers.
- [ ] Prototype Cloudflare Worker for Telegram webhook/relay without changing production webhook.
- [ ] Prototype independent foreign secondary origin and test Next.js SSR/Auth/API compatibility.
- [ ] Prototype Russian static/read-only emergency snapshot with public content only, commit timestamp and no private data/secrets.
- [ ] Document/test manual failover and rollback. Do not call a fallback operational until tested from independent networks.

### Telegram Web App status — 2026-10-11
- [x] Add `/app` and a `/start` Web App button that opens the existing site URL.
- [ ] Configure the correct public HTTPS hostname in BotFather and `MEDBIOHIM_APP_URL`; register webhook with a strong secret and verify on mobile Telegram.
- [ ] Implement and security-test Telegram `initData` validation, one-time account linking and registration. Opening a Web App is not authentication.
- [ ] Verify Node bot unit tests and PHP regression test on a functioning runner; do not infer success from source edits.

## Full checkpoint — 2026-10-11 (Telegram relay, Mini App entry, CI blocker)

### What was changed in source
- [x] PHP helper `backend/src/Support/TelegramWebhookSecret.php` denies requests when expected/provided secret is missing or empty and compares configured secrets with `hash_equals`.
- [x] `backend/src/Services/TelegramHomeworkService.php` delegates webhook secret validation to the helper.
- [x] Added `backend/tests/TelegramWebhookSecretTest.php`; workflow `.github/workflows/code-check.yml` invokes it.
- [x] Schedule UI now shows shared-homework creation to any signed-in user; homework API gate was adjusted to allow authenticated group members while retaining the existing group-scope resolver. Must still verify the exact authorization paths in runtime tests.
- [x] Telegram bot `/start` and `/app` offer a Web App button opening the existing site. This is a launch button only, not authentication.
- [x] Added strict Telegram Mini App `initData` validation helper and tests for missing/bad data, invalid/fractional/zero user IDs and duplicate/invalid payload cases. **Not yet wired into login/register/account-link routes.**
- [x] Node webhook can optionally forward group/supergroup updates to the existing PHP Telegram homework webhook over HTTPS using the configured shared secret.
- [x] Added Node tests for successful relay and no-endpoint fallback; updated the Telegram README to explain single webhook architecture and configuration.
- [x] Updated roadmap, phase status, sync stamp and integration docs to record the requirements, changes, and open work.

### Confirmed not done / not verified
- [ ] GitHub Actions has not successfully executed test steps. Latest observed runs failed in seconds with zero runner / empty runner name / no steps on some jobs; exact GitHub-side cause is unknown. No test suite should be called green.
- [ ] No end-to-end Telegram update has been received by the deployed bot and relayed to the actual PHP backend.
- [ ] No production secrets, webhook registrations, Vercel configuration, BotFather settings, SpaceWeb configuration, or production database were changed.
- [ ] `TELEGRAM_HOMEWORK_WEBHOOK_URL` is not confirmed/configured. Do not guess the actual API hostname.
- [ ] Shared webhook secret must match on Node and PHP. PHP `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USER_ID`, valid mapped group, schema, and deployment environment must be checked before enabling.
- [ ] BotFather Mini App domain, production `MEDBIOHIM_APP_URL`, and Telegram webhook registration still need setup and mobile smoke test.
- [ ] Telegram login/registration and secure existing-account linking are not implemented. Opening the site from Telegram does not authenticate a user.
- [ ] Node test source has been edited but not executed on a functioning runner; PHP syntax/full test suite also remain unverified.
- [ ] No claim is made that deployment/build/archive succeeded.
- [ ] Homework attachments, deduplication/idempotency, uncertain-message review, group authorization, and persistence must be tested end-to-end before claiming the Telegram homework feature complete.

### Current architecture decision
Telegram's bot token has one active webhook destination: register it only against the Node/Vercel `/api/webhook`. If the optional relay is enabled, Node forwards group/supergroup updates to PHP. Do not register the same bot token independently with Node and PHP, because one webhook registration would replace the other.

### Next continuation order
1. Inspect GitHub Actions account/repository settings and restore runner execution; do not change workflows blindly without evidence.
2. Run Node bot tests, PHP syntax checks, `TelegramWebhookSecretTest.php`, Mini App validation tests and existing frontend/backend checks.
3. Verify signed-in group member can create homework and non-member cannot; inspect subject/group/attachment checks server-side.
4. Confirm real backend origin and deploy environment, then configure shared secrets with owner approval; verify one real group update end-to-end.
5. Implement Telegram initData validation into an actual server endpoint, then one-time account-linking and registration with replay/expiry protection; add negative security tests.
6. Configure BotFather Web App domain and run Telegram iOS/desktop smoke tests.
7. Only then mark items complete in this registry and the phase/sync documents.


### Whole-project snapshot and hosting resilience — 2026-10-11
- [x] Added [full state snapshot](STATE-SNAPSHOT-2026-10-11.md) with product intent, current architecture, source changes, open work, CI blocker, historic defects to re-audit, and exact resume order.
- [x] Added [hosting resilience/free-tier plan](HOSTING-RESILIENCE-AND-FREE-TIERS.md): primary Vercel + Supabase + SpaceWeb + B2 remains unchanged; independent foreign secondary; Russian read-only emergency fallback; Cloudflare Workers as bot-webhook PoC candidate.
- [ ] Measure the reported slow Vercel-to-SpaceWeb/API/media path before selecting a performance fix.
- [ ] Confirm current provider free-tier terms from official documentation; the provider limits copied from the user's proposal are not yet verified.
- [ ] No hosting/DNS/deployment/production secrets/webhook/DB changes were performed for this plan.

