

## Extension + Telegram integration hardening (2026-10-11)

- 🟢 Extension search now prefers question text instead of concatenating all options, formulas and captions into one long query; when the question is too short, it falls back to formula text or image captions.
- 🟢 Telegram webhook adds /homework guidance and regression tests for commands addressed to a different bot and refusal of insecure HTTP relay URLs.
- 🟡 Group homework ingestion depends on the existing PHP TelegramHomeworkService, an explicitly mapped/active Telegram chat and correct server-side bot/secret configuration. Cloudflare Worker remains an un-deployed alternative; no production webhook changed.
- ⚠️ BotFather group privacy must permit ordinary group updates if the bot is expected to receive regular homework text/photos. Change this only for the intended bot and verify update delivery.
- ⬜ Next: run both bot test suites in Node 20, test a mapped group with text/photo/reply/media-group updates against a non-production backend, then improve extension image selection and consent-based OCR/vision after privacy review.
- 🔒 No production data writes, deploys, webhook changes, token exposure or new browser host permissions were made in this pass.


## Multimodal STEM questions — formula/equation groundwork (2026-10-11)

- 🟢 Side panel now has an editable formula/equation field and attempts to collect text exposed by MathML, KaTeX, MathJax, MathJax v3 containers, accessible formula labels, data-math nodes and code blocks in the likely question area.
- 🟢 Formula text and image captions are included in the explicit copy/search handoff alongside question and answer options. This covers some text-rendered chemical equations, mathematical notation and formula descriptions.
- 🟡 It does **not** reconstruct arbitrary 2D chemical structures, stereochemistry, reaction arrows, charges/subscripts lost by the page renderer, or formula drawings embedded only as pixels/canvas. Extracted notation must be reviewed before using it for answer matching.
- ⬜ Future work: structure-aware chemistry representation (e.g. MOL/SDF/SMILES when genuinely available in page data), image selection + user-consented OCR/vision, equation normalization that preserves stoichiometry/charge/state/conditions, and tests for organic structures, ionic equations, redox, equilibrium, graphs and image-only prompts.
- 🔒 No image/formula upload is automatic; no new host permissions or access-control bypass added.


## Image-based questions — extraction groundwork (2026-10-11)

- 🟢 Side panel now collects visible image-like elements in the likely question area and their available alt/ARIA/title/figcaption descriptions. This metadata is editable and included in the user-triggered copy/search handoff.
- 🟡 This is **not image recognition/OCR**: pixels, arrows/markers, histology morphology, chart axes and labels rendered only inside an image are not interpreted yet. Image URLs/pixels are not uploaded.
- ⬜ Next image pass: let the user explicitly choose the relevant image(s), add local/consented OCR or a secure vision endpoint only after privacy/auth review, preserve captions/marker context, and rank matches by question + options + image evidence. Never label an answer correct from visual similarity alone.
- 🔒 No host permissions, automatic image uploads, credential extraction or access-control bypass added.

## Browser extension — resilient extraction pass (2026-10-11)

- Commit `1d0d923dd40ad955207cf55acaa38bc96efb4e9e`: improved active-tab extraction with multiple DOM/ARIA selectors, option label associations, likely-question-root scoring and clearer manual fallback.
- Best-effort parsing of user-accessible visible content, not universal support. It does not bypass login, CAPTCHA, paywalls, anti-bot systems or inaccessible content. OCR and specialized source adapters remain future work.
- No host permissions, cookies/history access, automatic uploads or production data writes added. CI/browser runtime verification remains pending.

## Browser extension — authenticated search answer groundwork (2026-10-11)

- `backend/src/Services/SearchService.php`: authenticated search result includes stored answer text for published `questions` and `exam_questions`.
- `src/app/search/page.tsx`: answer is displayed in an explicit expandable section for question/ticket hits.
- Extension still opens the MEDBIOHIM search page; no bearer-token bridge or extension-side API request was introduced. No automatic imports, database writes or production deployment performed.
- Source commits: SearchService `95d6f7a038266f81bc79b28241a85e3b2c13b894`; search UI `aca96cfa873338f9ef75792fa2f7b56069fd3b2e`.
- Verification limits: source structure only; CI runner dispatch, PHP lint, frontend build, live API auth and Chrome/Edge runtime remain unverified.

## Telegram Cloudflare Worker prototype — 2026-10-11

- New isolated adapter: `integrations/telegram-bot-cloudflare/`; existing `integrations/telegram-bot/` Node/Vercel implementation is preserved.
- Includes public commands, `/health`, webhook secret validation, 256 KiB request cap, HTTPS-only optional PHP relay and Node test suite.
- CI updated in `.github/workflows/optional-integrations-check.yml`; runner execution still blocked/unverified.
- No Cloudflare deploy, secrets setup, Telegram webhook change, production API or database mutation performed.
- Start here: [Cloudflare Worker README](integrations/telegram-bot-cloudflare/README.md).

## Project state and hosting failover snapshot — 2026-10-11

Comprehensive restart point: [docs/PROJECT-STATE-AND-HOSTING-FAILOVER-2026-10-11.md](docs/PROJECT-STATE-AND-HOSTING-FAILOVER-2026-10-11.md). This records the last known main SHA, implemented vs unverified work, CI/Vercel/Supabase/PHP/LLM/Telegram status, outstanding security items, and a proposal (not yet implemented) to preserve Vercel → SpaceWeb → Supabase while evaluating Cloudflare edge, a second international frontend, Russian emergency mirror (Layero/ONREZA), and a persistent no-card Telegram webhook host. No production/database/deployment changes were made as part of the snapshot. Always verify current main HEAD before resuming.

## Latest continuation stamp — Pass 65–73, 2026-10-10

- Handoff: `docs/CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md`.
- All six workflows now explicitly restrict token permissions to `contents: read`.
- Fixed malformed shell-block indentation in `package-archives.yml`; commit `d566031d01e73f7a62a91e7502c9410456a9e6f2`.
- Current CI runs: code-check `38025017750`; smoke `38025017788`; SpaceWeb archive `38025017818`; source package `38025017740`. All still fail pre-step; package job has `runner_id: 0`, no runner name and empty steps.
- Do not claim CI or archive verification. Next action is owner-side GitHub Actions settings/runner provisioning investigation, then rerun real checks.
- No production DB mutation or manual deployment in this pass.

# Latest consolidated workstream — 2026-10-10

- Report: `docs/DATA-SECURITY-INTEGRITY-WORKSTREAM-2026-10-10.md`.
- Read-only data integrity checks remain green for test/question links.
- Least-privilege migration `database/migrations/20261010_revoke_non_rls_table_privileges.sql` is committed but NOT applied to production.
- No production database writes performed; GitHub Actions runner and target-runtime checks remain blocked/unverified.
- Work batching policy: group related changes by domain; preserve historical pass reports and commit history.

# Sync stamp

- Latest data integrity audit: Pass 54, `a4475b2` — 854 test-question links, no duplicate/broken links, all published active tests/questions linked; 719 blank exam answers classified as open-ticket/preparation-style; no database writes. Report: docs/DATA-INTEGRITY-RECONCILIATION-2026-10-10-PASS54.md.

- Date: 2026-10-10
- Branch: main
- Source of truth: GitHub main + Supabase + target deployment environments
- Documentation baseline: ROADMAP.md + PHASES_STATUS.md + docs/README.md
- Latest API proxy hardening: commit 6aeb401 (PHP-first trainer fallback, private media no-store, generic 502); CI still blocked before steps.
- Latest PHP/CI follow-up: docs/CI-PHP-AUDIT-2026-10-10-PASS52.md (homework SQL placeholders, planner SQL, error response hardening; full CI still blocked)
- Latest security fix: docs/CI-PHP-AUDIT-2026-10-10-PASS51.md
- Previous access-control pass: docs/SECURITY-FIX-2026-10-10-PASS50.md
- API cache isolation: docs/RELIABILITY-FIX-2026-10-10-PASS46.md
- Functional audit: docs/FUNCTIONAL-AUDIT-2026-10-09-PASS41.md
- GitHub Actions status: blocked before step execution (`runner_id=0`, `BlobNotFound`); see docs/CI-PHP-AUDIT-2026-10-10-PASS51.md and run 37993824049
- Unfinished registry: docs/UNFINISHED-REGISTRY.md
- API coverage audit: docs/API-COVERAGE-2026-10-04.md
- API reliability fix: docs/RELIABILITY-FIX-2026-10-09-PASS43.md
- Unified verification checklist: docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md
- Recursive trainer sanitizer hardening: docs/SECURITY-FIX-2026-10-10-PASS45.md
- API cache scope hardening: docs/RELIABILITY-FIX-2026-10-10-PASS46.md
- Private media cache isolation: docs/SECURITY-FIX-2026-10-10-PASS47.md
- Histology material access guard: docs/SECURITY-FIX-2026-10-10-PASS48.md
- Consistent access across material/file endpoints: docs/SECURITY-FIX-2026-10-10-PASS49.md
- Subject catalog/gradebook/context access: docs/SECURITY-FIX-2026-10-10-PASS50.md
- Structured bug report form: .github/ISSUE_TEMPLATE/bug_report.yml
- Browser extension MVP: integrations/browser-extension/README.md
- Telegram bot MVP: integrations/telegram-bot/README.md

## Latest available data snapshot (live counts last checked 2026-10-06; Pass 41 read-only spot checks 2026-10-09)
- Histology `exam_questions`: 466 records (366 published, 100 unpublished; repeated-text groups require comparison, not automatic deletion)
- Histology `ticket_banks`: 5 (preserved; not modified)
- Published histology material records: 80 (physical document/image availability is not proven by metadata)
- Published trainer feed cards: 206; the trusted base table retains grading keys, but public safe view exposes 0 correctness flags
- Published electronogram cards: 28; read-only reconciliation on 2026-10-10 found 28 non-empty source keys, 0 exact/basename matches in `content_sources.source_path`, and 0 matching image assets in the GitHub `main` tree. SpaceWeb/B2 file existence and authenticated HTTP responses remain unverified.
- `questions`: last full integrity snapshot recorded 855 rows and 660 published non-archived
- `tests`: last full integrity snapshot recorded 33 total and 32 published
- Treat the counts above as the last recorded snapshots, not as proof that the newest deployment is functioning.

## Current open checks — updated 2026-10-10
- GitHub Actions runner dispatch: current retries fail before first step (`runner_id=0`, `steps=[]`, no logs); execution of tests is unconfirmed. This is a runner allocation/dispatch failure, not evidence that the test commands themselves failed. The PHP namespace autoloader in code-check was corrected; a 15-assertion sanitizer regression test was added and passed in an isolated PHP 8.4 run using the repository class/test content, but has not yet run on GitHub Actions.
- Latest observed READY Vercel deployment is `6687e057`; it includes frontend Pass 45 recursive sanitization, Pass 46 malformed-token cache isolation and Pass 47 private media cache isolation. Pass 48–50 are PHP route/repository/context changes and are not confirmed deployed to SpaceWeb. Browser/API runtime smoke remains open. Live browser behavior remains unverified. SpaceWeb PHP deployment remains unverified because GitHub Actions jobs fail before checkout (`runner_id=0`, no steps/logs).
- P1 mitigation applied: base table access revoked for public client roles; safe view and server-side scoring RPC live; PHP/Next source sanitizers committed. Pass 44 (`99ed1bc`) also hardens PHP route membership checks for feed/detail/answer/image and recursively sanitizes nested question payloads. Full authenticated runtime acceptance and SpaceWeb PHP deployment remain open; details: [Pass 44 report](docs/SECURITY-FIX-2026-10-10-PASS44.md) and [Pass 45 report](docs/SECURITY-FIX-2026-10-10-PASS45.md).
- SpaceWeb/B2 physical media verification for trainer/material paths and 404/502.
- SpaceWeb deployment workflow now stops if its pre-deploy backup is missing/empty and verifies Pass 44 source markers after upload; actual deployment is still unconfirmed.
- AI provider runtime/fallback verification.
- Optional browser extension manual install and route check.
- Telegram bot MVP deployment and webhook registration require separate Vercel project + secret environment variables; no token is stored in GitHub. Private notifications remain blocked until account linking/idempotency/security gates are implemented.
- final histology plan ↔ content matrix and lecture-source reconciliation.
- admin database console target-runtime test and raw SQL safety review.
- duplicate/blank-answer question review; no mass deletion or auto-publication.
- browser regression for login/dashboard/schedule/tests/materials and iPhone/desktop viewer.

## Current verified cleanup
- no frontend /api-compat calls
- homework is API-only
- no frontend/ shadow tree
- no spaceweb_upload/ shadow tree
- legacy QuestionBank service removed
- dead mock/fixture UI artifacts removed
- all public base tables currently have RLS enabled in Supabase

## Deep audit
- docs/FULL-AUDIT-2026-10-04.md
- docs/DEEP-AUDIT-2-2026-10-04.md
- docs/UNFINISHED-REGISTRY.md
- docs/API-COVERAGE-2026-10-04.md
## Current open checks
- Latest observed READY Vercel deployment is `d0949aa3`; later main commits primarily change CI/docs/isolated integrations. Live browser/API verification remains open. Live browser/API verification remains separate from GitHub CI.
- SpaceWeb trainer media 404/502 requires real file/B2 verification.
- AI provider runtime health / fallback credentials remain external checks.
- Full histology plan ↔ content mapping remains a product/content task.
- Admin specialized editors remain a product task; raw DB editor exists.
- Final Code Checks for 84d4684a013660e9c6a8e0d624edaae9ab4f7c13: ✅ green.



## 2026-10-08 — Histology Lecture 05 content sync
- Lecture: lec-histology-blood-20261008 — published.
- Canonical topic: b1000001-0000-4000-8000-000000000007.
- Preparation cross-links: 8 published blood-smear trainer cards.
- Electronogram cross-links: neutrophil phagocytosis + blood capillary.
- Test: «Гистология — общая: кровь», 20 questions.
- Exam-question IDs recorded in lecture metadata.
- Migration: database/migrations/20261008_histology_lecture_05_learning_links.sql
- Detailed record: docs/HISTOLOGY-LECTURE-05-BLOOD-LINKS-2026-10-08.md
- Open: production/browser smoke and physical media verification.


## 2026-10-08 — Histology Lecture 05 Mermaid repair
- Fixed imported `body_md` escaping for Lecture 05.
- Live verification: 11 Mermaid blocks, 0 escaped backticks, 0 escaped quotes.
- Frontend `LectureRenderer` now normalizes escaped Mermaid fences before parsing.
- Migration: `database/migrations/20261008_histology_lecture_05_mermaid_escape_fix.sql`.
- Open: Vercel deployment + iPhone/Safari/desktop browser smoke for actual Mermaid SVG rendering.

## 2026-10-08 — Lecture 05 iPhone/Safari defect repair
- Source: main
- Histology scope only: Lecture 05 «Кровь и лимфа»
- Fixed: malformed Markdown-link regex in LectureRenderer
- Fixed: MEDBIOHIM preparation photos now resolve through authenticated trainer image pipeline by canonical trainerId
- Live Supabase Lecture 05 updated; old direct /content/histology photo URLs removed from the five embedded trainer-photo blocks
- Added migration: database/migrations/20261008_histology_lecture_05_trainer_images_fix.sql
- WebPath external images remain direct HTTPS sources
- Runtime gate: Vercel READY + iPhone/Safari smoke still required
 
## 2026-10-08 — Deployment verification constraint

- Latest manually inspected Vercel production deployments for the new learning-UX commits include build failures on commits `9c4b03b`, `9ed99d2`, and `cd0765e`.
- A new Vercel deployment could not be triggered from the connected deployment API because the Free daily deployment quota is exhausted (>100/day; retry window reported as 24h).
- Therefore the current frontend learning-UX code is **not** declared production-verified.
- Supabase Lecture 05 content changes are live and verified separately.

 
## 2026-10-08 — Lecture 05 age norms update

- Live lecture `lec-histology-blood-20261008` получила блок 7A–7E по присланным возрастным нормам.
- Добавлены возрастные перекрёсты, возрастная лейкоцитарная формула, ключевые нормы гемограммы и алгоритм интерпретации карточки.
- Мини-тест блока использует существующие вопросы `public.questions`: новорождённый, нормы эритроцитов у женщин и объём крови взрослого.
- Количество quiz blocks в live Lecture 05: **8**.
- Новый migration: `database/migrations/20261008_histology_lecture_05_age_norms.sql`.
- Scope остаётся только `histology` / Lecture 05.


## 2026-10-08 — ImageLightbox explicit controls

- Commit: 7735ff1ccdc21b509ca6e61bb8267d81a3a1a4bf.
- ImageLightbox теперь имеет явную кнопку «Открыть на весь экран» на изображении.
- В lightbox добавлены кнопки «Уменьшить / Увеличить / Сбросить / Полный экран / Закрыть».
- Mobile-friendly controls сохранены; native Fullscreen API — дополнительный режим, fixed modal — fallback.
- Production/iPhone Safari smoke остаётся открытым до фактической проверки.


## 2026-10-08 — Unified Media Viewer correction
- Branch: fix/unified-media-viewer-desktop-mobile
- Fixed Atlas nested modal architecture: card → legacy modal → ImageBox → ImageLightbox replaced by direct TrainerImageViewer → ImageLightbox.
- Viewer contract: 100dvh, safe-area, visible controls, zoom/reset, drag/pan, desktop wheel/double-click, touch Pointer Events, optional native Fullscreen.
- New component: src/components/trainers/TrainerImageViewer.tsx.
- Runtime gate: Windows desktop + macOS + iPhone Safari + Android Chrome + Lecture/Trainer/Materials regression.
- Production status remains not verified until deployment/browser evidence exists.


## 2026-10-08 — viewer regression cleanup
- Removed literal escaped-newline TSX artifact in `HistologyTrainerParts.tsx`.
- Removed unreachable legacy photo branch from Materials after unified viewer migration.
- Materials image-file preview now uses `ImageLightbox`; trainer photo gets retry.
- Materials blob URL lifecycle cleaned up for image/PDF/document preview.
- Latest PR #18 head: `16b168126df8529441b0424e8b6b5b07874802d6`.
- Runtime remains unverified: Vercel build-rate-limit; GitHub code-check jobs fail before steps/logs.

## 2026-10-08 — pre-launch stability audit
- Current working branch remains `fix/unified-media-viewer-desktop-mobile`; no new branch created.
- Fixed live schedule session linkage: 309/309 schedule entries now have academic session context.
- Fixed PHP namespace exception hazards in TestRepository, CalculatorsService and SrsService.
- Viewer loading/error states now use the same top-level portal boundary as the main media viewer.
- Runtime/deployment verification remains open until Vercel/SpaceWeb/browser evidence exists.


## 2026-10-08 — canonical main sync / unified viewer refinement
- Canonical branch: `main`.
- `ImageLightbox` refined for cursor/touch anchored zoom, bounded pan, pinch focal preservation and responsive controls.
- `fix/unified-media-viewer-desktop-mobile` audit: 0 commits ahead of `main`; its viewer work is already integrated.
- Other divergent branches were audited; no stale wholesale merge was performed.
- Production/browser acceptance is still open because deployment/runtime evidence for the exact current `main` commit is not yet available.


## 2026-10-08 — Leukocyte practical case-card trainer
- Source basis: `4.Кровь.docx` (возрастные нормы лейкоцитарной формулы, терминология отклонений, морфология и функции клеток).
- Main trainer mode: `case` — image recognition → age norm → result transcription → conclusion → preliminary hypothesis for grade 5.
- Grading is explicit: any error in first 4 fields = 2; all four = 4; all four + justified functional hypothesis = 5.
- Subject hub and RichLectureEditor use the practical case mode.


- **2026-10-08 visual-trainer sync:** leukocyte case cards now use only unambiguous single-cell visuals; shared multi-leukocyte smears are excluded from the identification step. Focused-image support was added to ImageLightbox, while existing zoom/pan/pinch/fullscreen behavior is retained.


- **2026-10-08 visual variety sync:** leukocyte case cards now randomize between validated real specimens and source-based SVG teaching drawings. Each cell has two drawing variants; photo mode can use a confirmed local single-cell card or a focused WebPath specimen where available. The same image viewer controls work for both raster specimens and vector teaching drawings.


- **2026-10-08 test-builder sync:** admin tests page now supports creating one test or several randomized variants from a selected question pool, with a full reset button for a fresh test, subject/module/topic binding, publication toggle, and in-UI guidance on the difference between a test container and a question.


- **2026-10-08 neutrophil-scope sync:** smear cards now distinguish population-level identification from single-cell identification. For total neutrophils, the UI explicitly explains that band and segmented neutrophils belong to the same assessed population and shows the source-based visual rule for telling p/y from s/y apart.


- **2026-10-08 single-cell-only sync:** leukocyte practical cards now require identification of one concrete cell in every round. Population-level/general-smear cases are excluded from the active trainer, and the target cell name is not exposed before submission.


- **2026-10-08 trainer-history sync:** leukocyte practical cards now preserve per-round case state, entered answers, and evaluation. Users can return with a Previous button or direct round-number navigation; restarting clears the current in-session history.


- **2026-10-08 morphology-hint sync:** the leukocyte practical trainer now includes a collapsible detailed morphology guide covering neutrophils (including maturation forms), eosinophils, basophils, lymphocytes, monocytes, platelets, and an express recognition algorithm.


- **2026-10-08 grading sync:** text answers are now spelling-tolerant while numerical answers remain content-strict. Cell names accept ordinary singular/plural forms and minor typos; decimal comma and dot are interchangeable for numeric input.


## 2026-10-08 — blood norm table trainer
- Added `src/components/trainers/BloodNormTableTrainer.tsx`.
- The trainer reproduces the age-based leukocyte differential table from `4.Кровь.docx` with 35 fillable cells.
- Student fills the table from memory, then checks themselves; each cell is graded and an overall percentage is shown.
- Numeric formatting is tolerant (`0,5`/`0.5`, dash variants, optional `≈`), while the source values themselves are unchanged.
- Added as a third mode in `src/components/trainers/SubjectTrainersHub.tsx`: **«Нормы крови»**.
- Scope: histology only; no external norms added.


## 2026-10-08 — meaning-answer trainer
- Added `src/components/trainers/BloodMeaningTrainer.tsx`.
- Added **«Ответ по смыслу»** as a fourth mode in `SubjectTrainersHub`.
- Scope: histology / blood preparation content from `4.Кровь.docx` only.
- Free-text answers are checked by semantic concept groups rather than exact string equality; spelling/case are ignored.
- Current set: 12 source-grounded questions with reference answers and missing-concept feedback.


## 2026-10-08 — blood preparation photo trainer
- Added `src/components/trainers/BloodPreparationTrainer.tsx`.
- Added **«Препараты крови»** as a new `SubjectTrainersHub` mode.
- Uses existing local blood preparation images only; no invented photo sources.
- Includes morphology → function → differential clues for neutrophil, eosinophil, lymphocyte, monocyte and platelets, plus comparison cards.
- Comparative multi-cell photos are explicitly treated as teaching comparisons, not single-cell identification cases.


## 2026-10-08 — blood sources + SpaceWeb textbooks integration
- BloodPreparationTrainer.tsx теперь использует реальные trainer-фото через защищённый API/ImageLightbox, а не прямые frontend-пути к изображениям.
- В карточках препаратов добавлены источник, ориентир «куда смотреть», пошаговый алгоритм определения, морфология, функция и признаки для дифференциации.
- Карточки опираются на 4.Кровь.docx и дополнительную учебную памятку; сравнительные фото остаются именно сравнительными.
- Для SpaceWeb добавлен защищённый каталог PDF: content/histology/source-materials/Учебники/.
- Frontend раздела «Материалы» автоматически показывает PDF из «Учебники» с сохранением исходных имён файлов; запись в Supabase для самого PDF не требуется.
- Доступ к книгам ограничен авторизацией и специальностью МБХ; путь к файлу проверяется на traversal и выдаётся inline как PDF.
- Точная проверка конкретных atlas-файлов не подменена догадкой: в предоставленных архивах отдельные atlas-картинки с таким именем не обнаружены, поэтому в тренажёр не добавлены выдуманные «atlas» источники.


## 2026-10-09 — admin database console / external SQL connections
- Добавлена защищённая админская консоль /admin/database.
- Основная БД Supabase отображается как встроенное подключение; её server-side реквизиты не выдаются браузеру для редактирования.
- Добавлены профили SpaceWeb: PostgreSQL pg4.sweb.ru:5433, БД ryazansev3, пользователь ryazansev3; MySQL 8 127.0.0.1:3308, БД ryazansev3, пользователь ryazansev3.
- Из сайта доступны настройка подключения, проверка соединения, просмотр таблиц и схем, чтение/поиск строк, вставка, изменение и удаление строк, а также SQL editor.
- Изменяющие SQL-операции требуют явного подтверждения; разрешён один SQL-оператор за запуск; опасные операции чтения файлов/выгрузки запрещены.
- Пароли внешних БД не показываются обратно и хранятся на backend только в зашифрованном виде.
- В Supabase создана отдельная public.admin_db_connections; RLS включён, прямой доступ anon/authenticated закрыт.
- Реальные подключения SpaceWeb пока не тестировались без пароля: профили заполнены по предоставленным реквизитам, поле пароля остаётся пустым до ввода секрета администратором.


## 2026-10-09 — Functional audit Pass 41
- Audit report: `docs/FUNCTIONAL-AUDIT-2026-10-09-PASS41.md`.
- Fixed two malformed PHP array expressions in `backend/src/Services/AdminDatabaseManager.php`: commit `fb4eed97e0710eaeaccc8aeddb51a42acc53af24`.
- Code-check retry `37935997871`, attempt 2: job did not allocate a runner; no test steps ran.
- Roadmap and phases status were synced to Pass 41; no Supabase rows or schema were modified by this audit.
- Next work order: trainer-answer confidentiality → runner/CI recovery → exact commit deployment verification → physical media reconciliation → histology question/lecture source review → runtime/browser smoke.


## 2026-10-09 — Trainer answer-key security Pass 42
- Live Supabase migration applied: database/migrations/20261009120000_secure_trainer_feed_answers.sql.
- Public clients can SELECT only the sanitized trainer_feed_cards_public view; direct client SELECT on trainer_feed_cards is revoked.
- Verified in an active MBH membership context: 206 published cards are visible and the view returns 0 correctness flags / 0 answer-bearing fields.
- Direct client access to trainer_feed_answers, trainings, and training_answers is revoked for anon/authenticated; submit_trainer_feed_answer RPC performs authenticated server-side scoring.
- PHP response sanitizer protects newly-created and unanswered training snapshots; Next proxy applies the same protection while preserving review data after answer/skip.
- Remaining gate: deploy latest frontend + SpaceWeb backend, then authenticated MBH/non-MBH feed → training → answer → review smoke. CI runner failure still prevents automated checks.


## 2026-10-09 — API timeout/cache reliability Pass 43
- Commit 77b0f4a1 fixes timeout bypass when a caller provides AbortSignal and marks stale cache fallback responses with stale=true.
- API client fix is now included in the Vercel production READY deployment at commit a56d3fdb; browser-level timeout behavior remains untested.
- CI runners still fail before checkout; TypeScript/build checks remain unexecuted.


## Latest consolidated workstream — Pass 55 (2026-10-10)

- Report: `docs/CI-MEDIA-TRACEABILITY-WORKSTREAM-2026-10-10-PASS55.md`.
- Workflow YAML reviewed; latest Actions job still ends before steps (`steps: null`), so CI remains unverified and no green result is claimed.
- Read-only Histology electronogram audit: 28 cards, 28 with captions, 28 with `source_file_id IS NULL`, 5 basename mismatches between `source_key` and `preparation.imageUrl`.
- Reproducible SELECT-only audit: `database/audits/20261010_electronogram_asset_traceability.sql`.
- No production DB writes or path rewrites. Next: owner-side runner diagnosis, physical SpaceWeb/B2 media check, then evidence-based path correction if required.


### Pass 55 follow-up — fresh Actions run check

After the Pass 55 documentation commits, checked fresh runs on the current documentation commit: code checks `38011994749` (frontend + backend), smoke `38011994779`, and archive build `38011994746`. All three workflows ended in failure with `steps: null`. This reproduces the pre-step failure across different workflow definitions; it still does not expose a root cause or mean that PHP/frontend test commands ran. CI remains blocked.


## Pass 56 — database least-privilege + quality-gate reconciliation (2026-10-10)

- PostgreSQL 17.6 read-only audit: effective MAINTAIN/TRUNCATE/REFERENCES/TRIGGER privileges exist on 71/83 public tables for `anon` and 78/83 for `authenticated`.
- Proposed migration now covers all four privileges and default ACLs for `postgres` and `supabase_admin`; it is not applied.
- Added read-only post-migration verification SQL and corrected stale quality-gate claims: latest Actions runs are pre-step failures, not current green checks.
- Report: `docs/DATABASE-LEAST-PRIVILEGE-STATUS-RECONCILIATION-2026-10-10-PASS56.md`.

Latest read-only privilege counts and current Actions evidence: 83 public tables; anon has four unnecessary privileges on 71 tables, authenticated on 78. Migration remains unapplied. Latest smoke/code-check/archive jobs fail with `steps: null`; do not claim CI green.

## 2026-10-10 — Pass 57 CI/DB preflight

- Latest checked smoke retry: [run 38012180433](https://github.com/MISTACEN/medbiohim/actions/runs/38012180433), attempt 2 — failed before steps; job reports `steps: null`, no logs. CI remains blocked/unverified.
- Read-only Supabase role/default-ACL review completed. Least-privilege migration remains unapplied; no production writes.
- Detailed report: `docs/CI-DB-PREFLIGHT-WORKSTREAM-2026-10-10-PASS57.md`.

## 2026-10-10 — Pass 58 release-gate source audit

Manual source review found: missing frontend lockfile; ESLint config has ignore patterns only; Next build ignores built-in TypeScript errors while predeploy audit separately runs typecheck; SpaceWeb FTPS certificate verification is disabled; rollback after partial upload is not demonstrated. No source/deployment/production mutation was made. Actions remains blocked before steps/logs.

Report: `docs/RELEASE-GATE-SOURCE-AUDIT-2026-10-10-PASS58.md`.


## Latest reconciliation — Pass 59 (2026-10-10)
- Current source head inspected: `8bb7f04320b0e497a7035a85545073dc26a69df7`; report-only follow-up commit: `7b940634214bfc987af9d44fee68ce42575e867d`.
- Actions code-check, smoke, backend archive, and package jobs fail before exposing steps (`steps: null`). Checks remain blocked/unverified, not green.
- No production deployment or database write was performed. See `docs/CI-RUNNER-RECONCILIATION-2026-10-10-PASS59.md`.


## Pass 60 — 2026-10-10
- CI path filters committed for docs-only changes: `ad80b9c7`, `f2ae57b5`, `3d0bc8a4`, `1e14f1e5`.
- This reduces unnecessary queue load but does not establish that GitHub Actions can execute steps. CI remains blocked/unverified until jobs expose actual steps and results.
- Report: `docs/CI-DOCS-ONLY-FILTERS-2026-10-10-PASS60.md`.


### Pass 60 verification update
Observed: workflow-change commits triggered CI and all latest jobs still returned `steps: null`; later docs-only commits did not produce newer workflow runs. Path filters appear to reduce docs-only churn, but runner initialization remains unresolved.


## Pass 61 — 2026-10-10
Explicit job-step API returned empty arrays and job-log download returned `BlobNotFound` for code-check run `38013521893` (backend job `114098661992`, frontend `114098662106`). CI remains blocked/unverified. See `docs/CI-JOB-LOG-DIAGNOSTICS-2026-10-10-PASS61.md`.


## Pass 62 — 2026-10-10
Vercel read-only inspection found a READY deployment for a recent docs commit and a newer deployment still BUILDING at inspection time; final latest state is unconfirmed. Runtime logs API returned 403 and build-event logs were unavailable (404). See `docs/VERCEL-RUNTIME-OBSERVABILITY-2026-10-10-PASS62.md`.


## Pass 63 — pre-deploy audit reconciliation (2026-10-10)
- Added a heuristic warning when ESLint flat config has no recognizable rules or presets.
- Removed duplicated Pass 61/62 status entries where confirmed; historical reports preserved.
- Actions latest run state checked separately; source checks remain unverified until actual steps/logs are available.
- No production database writes, secrets, or manual deployment changes.
- Report: `docs/PREDEPLOY-AUDIT-STATUS-RECONCILIATION-2026-10-10.md`.


## Pass 64 — archive security + pass inventory (2026-10-10)
- Hardened source/backend/SpaceWeb archive workflows to exclude root and nested `.env*` files and added an archive-list guard before upload.
- Recursive repo inventory: 38 documentation files named PASS<number>.md, highest numbered report Pass 64; this is not 62 sequentially completed passes because numbering has historical gaps.
- Unfinished registry currently has 22 closed legacy blockers (C-01…C-22) and 7 broad open workstreams (R1–R7), plus release blockers for CI execution, dependency lockfile/lint, FTPS validation, and DB migration staging.
- Validation caveat: four latest workflow attempts still failed before exposing executable steps/logs; archive guard has not yet run in CI.
- Report: [Pass 64 archive security and inventory](docs/ARCHIVE-SECURITY-AND-PASS-INVENTORY-2026-10-10-PASS64.md).


Pass 77 (2026-10-10): `.github/workflows/build-spaceweb-archive.yml` now enables `set -euo pipefail` before archive preparation (commit `4d37b00438ebfe4a73291e1176e942f0da8f00f1`). CI remains blocked before job steps; no test pass is claimed. Current handoff: `docs/CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md`.


Pass 78 (2026-10-10): Added `backend/tests/AccountSettingsPreferencesTest.php`, wired into code-check and deploy preflight. Current `main` at code change: `0471c13a1208f830dbe9901a0119175e08518f51`; CI still fails before steps without logs, so tests are not verified. Handoff: `docs/CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md`.

## 2026-10-11 — Product intent and integration contract recorded

- Canonical requirements: `docs/MEDBIOHIM-PRODUCT-INTENT-AND-INTEGRATION-CONTRACT.md`.
- Preserve existing site structure/design; improve current workflows without a global redesign unless requested.
- MEDBIOHIM is an independent student exam/self-preparation platform, not the official university site.
- Imported real questions must retain provenance; AI-generated or unverified answers must not be presented as official.
- Manual student entry, Telegram and future extension imports must converge on one homework model with server-side group membership checks.
- Telegram must support both registration/login + Mini App entry and group-chat homework ingestion.
- Open source findings: checked homework UI/API restrict creation to privileged roles, conflicting with the intended group-member policy; PHP webhook secret validation accepts requests if the configured secret is empty; full Telegram account-linking/Mini App E2E is not confirmed.
- This pass records requirements only; no code, production deployment or DB writes. GitHub Actions remains unverified because jobs terminate before steps.

## 2026-10-11 — First implementation slice: homework permissions + webhook hardening

- PHP Telegram webhook secret now uses `Medbiohim\\Support\\TelegramWebhookSecret::matches()`, which rejects missing/empty configured and supplied secrets.
- Added `backend/tests/TelegramWebhookSecretTest.php`; wired into backend code-check workflow.
- Shared homework creation now permits authenticated group members, not only starosta, while non-staff requests must resolve a valid group membership through `AcademicContextResolver::requireGroup()`.
- Schedule create button is visible for signed-in users in the existing subject-selected flow; privileged management behavior is not widened.
- Automated execution remains unverified until GitHub Actions gets past runner initialization. No production deploy or DB writes.

## Project checkpoint — 2026-10-11

Complete hand-off and project inventory: [docs/STATUS-2026-10-11.md](docs/STATUS-2026-10-11.md). The snapshot records implemented source changes separately from unverified runtime behavior and historical issues that require re-audit.

## 2026-10-11 — Полный контрольный снимок перед паузой
Создан [docs/PROJECT-CONTROL-SNAPSHOT-2026-10-11.md](docs/PROJECT-CONTROL-SNAPSHOT-2026-10-11.md): продукт, архитектура, последний код, подтверждённые и неподтверждённые состояния, известные дефекты, расходы/лимиты и точная последовательность возобновления. Главный блокер — GitHub Actions завершается до выполнения шагов; тесты не объявлять пройденными.

## 2026-10-11 — Pause checkpoint / next-session handoff

See [`docs/UNFINISHED-REGISTRY.md`](docs/UNFINISHED-REGISTRY.md), section “Full checkpoint — 2026-10-11”, for the full inventory of source changes, missing configuration, unverified behavior, safety requirements, and continuation order. No production configuration or database changes were made.

## 2026-10-11 — Full state snapshot + hosting resilience plan

- Added `docs/STATE-SNAPSHOT-2026-10-11.md`: project identity, architecture, current code edits, what is not implemented, CI blocker, previous known risks, content requirements and resumption order.
- Added `docs/HOSTING-RESILIENCE-AND-FREE-TIERS.md`: keep current primary hosting, measure latency, evaluate Cloudflare Worker for bot relay, a separate foreign secondary origin and a Russian emergency static mirror.
- No production hosting migration, DNS change, secret change, bot webhook change or database migration was performed.
- Hosting providers and quotas remain candidates to verify; no provider is approved as a guaranteed free or fully working failover yet.

## 2026-10-11 — Single Telegram webhook + PHP homework relay

- Node webhook now optionally forwards group/supergroup updates to PHP `/api/v1/telegram/webhook` over HTTPS using the shared `X-Telegram-Bot-Api-Secret-Token` header.
- This resolves the architecture conflict where a single Telegram bot token cannot independently deliver the same updates to two different webhooks. Register Telegram only against Node; Node relays group updates to PHP when configured.
- Added Node regression tests for relay behavior. Not run successfully yet because GitHub Actions jobs are ending before any steps.
- Configuration and live test remain pending; no secrets, webhook settings, or production database were changed.

## 2026-10-11 — Telegram Web App entry MVP

- Added `/app` command; `/start` now presents a Telegram Web App button opening `MEDBIOHIM_APP_URL` (default `https://medbiohim.vercel.app/`).
- Added regression coverage for the command response; setup notes now cover BotFather domain + webhook registration.
- This only opens the existing site in Telegram. It does not yet validate Telegram initData, register a new user, or link a Telegram identity to an existing account.
- Runtime test and CI remain pending; GitHub Actions runner blocker persists. No production deployment, secrets or DB were changed.

## 2026-10-11 — Hosting resilience plan

- Added `docs/HOSTING-RESILIENCE-AND-FREE-TIERS.md` with tiered strategy: current primary retained; independent foreign fallback next; Russian read-only emergency snapshot later.
- Cloudflare Workers is the first webhook hosting candidate for a proof of concept only; current Node/Vercel bot remains until compatibility tests and rollback are proven.
- Free-tier limits/card requirements from the proposed list are unverified and must be checked against official terms at the time of deployment.
- No hosting migration, DNS change, production secret change, or database replication was performed.

## 2026-10-11 — Full project continuation checkpoint

- Added full handoff snapshot, current status, known historical defects, architecture constraints, next-step order and new-chat prompt to `docs/UNFINISHED-REGISTRY.md`.
- Added `docs/HOSTING-RESILIENCE-AND-FREE-TIERS.md` and linked the plan from project documentation.
- Snapshot distinguishes source changes from unverified tests/runtime and notes that production settings were not changed.


## Browser extension requirements — 2026-10-11

- Specification recorded: `docs/BROWSER-EXTENSION-TRUSTED-SOURCES-ANSWER-LEARNING-SPEC-2026-10-11.md`.
- Requirements agreed: subject inference/manual correction; compact side-panel answer lookup; trusted-source allowlist; beta/review queue for unknown sources; first-seen question candidate capture; post-test evidence-based answer learning; admin journal with sorting/filtering/editing/audit trail.
- This is documentation only. Existing extension functionality is not yet upgraded, and tests/live site compatibility are not verified.


## Browser extension first implementation slice — 2026-10-11

- Code: integrations/browser-extension/sidepanel.html, sidepanel.css, sidepanel.js, background.js, updated manifest.json and README.
- Current behavior: compact side panel, manual page extraction, heuristic subject suggestion, editable question/options, copy, platform search handoff and quick links.
- Permissions: activeTab, scripting, sidePanel; no host permissions or automatic ingestion.
- Remaining: direct authenticated search, candidate ingestion, end-of-test answer evidence, source trust/moderation and admin journal.
- Validation: workflow syntax/manifest checks added; not yet executed because Actions runner allocation remains unverified. Real browser behavior not yet tested.


## Telegram account linking — 2026-10-11
- Source pass committed: private one-time link tokens (10-minute expiry, SHA-256 hash storage), authenticated Settings endpoints for start/status/unlink, transactional PHP confirmation through the existing webhook secret, Cloudflare Worker `/start link_<token>` handling, and Settings UI.
- Migration: `database/migrations/20261011120000_telegram_account_linking.sql`.
- NOT live/verified yet: migration has not been confirmed applied; real SpaceWeb API origin is not identified; Worker variable `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL` must be set; PHP/Worker deploy and E2E tests remain pending.
- Telegram-only sign-in is a separate pending phase. Do not claim full Telegram login yet: a linked Telegram ID does not itself create a valid Supabase Auth session.
- Details and setup checklist: `docs/TELEGRAM-ACCOUNT-INTEGRATION-2026-10-11.md`.


## Continuation stamp — subject plan RPC restoration (2026-10-17)

- Source target: `main`; no new branch.
- Supabase migration `20261017180000_student_subject_plan_rpc`: applied live and committed to source. Live function grants checked: anon denied, authenticated allowed; search_path empty; direct `site_content` RLS unchanged.
- Code edited: `integrations/cloudflare-api/src/supabase-auth.js`, `integrations/cloudflare-api/src/index.js`, `workers/api/src/routes/plans.ts`, `src/app/subjects/[id]/page.tsx`; tests added in both Worker test paths.
- Goal: restore complete plan payload from curated JSON and merge workload metadata into subject page; render histology micro-preparations and electronogram marker.
- Local source verification: pending for the exact latest commit. Do not mark typecheck/tests or authenticated end-to-end acceptance green until run.
- Deployment: latest documented blockers remain missing/empty `CLOUDFLARE_API_TOKEN` in Actions and Vercel production API HTTP 403. Live website fix is not confirmed.
