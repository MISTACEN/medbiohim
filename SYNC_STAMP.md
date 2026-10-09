# Sync stamp

- Date: 2026-10-10
- Branch: main
- Source of truth: GitHub main + Supabase + target deployment environments
- Documentation baseline: ROADMAP.md + PHASES_STATUS.md + docs/README.md
- Latest security fix: docs/SECURITY-FIX-2026-10-09-PASS42.md
- Functional audit: docs/FUNCTIONAL-AUDIT-2026-10-09-PASS41.md
- Unfinished registry: docs/UNFINISHED-REGISTRY.md
- API coverage audit: docs/API-COVERAGE-2026-10-04.md
- API reliability fix: docs/RELIABILITY-FIX-2026-10-09-PASS43.md
- Unified verification checklist: docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md
- Structured bug report form: .github/ISSUE_TEMPLATE/bug_report.yml
- Browser extension MVP: integrations/browser-extension/README.md
- Telegram bot MVP: integrations/telegram-bot/README.md

## Latest available data snapshot (live counts last checked 2026-10-06; Pass 41 read-only spot checks 2026-10-09)
- Histology `exam_questions`: 466 records (366 published, 100 unpublished; repeated-text groups require comparison, not automatic deletion)
- Histology `ticket_banks`: 5 (preserved; not modified)
- Published histology material records: 80 (physical document/image availability is not proven by metadata)
- Published trainer feed cards: 206; the trusted base table retains grading keys, but public safe view exposes 0 correctness flags
- Published electronogram cards: 28; physical paths still require SpaceWeb/B2 HTTP verification
- `questions`: last full integrity snapshot recorded 855 rows and 660 published non-archived
- `tests`: last full integrity snapshot recorded 33 total and 32 published
- Treat the counts above as the last recorded snapshots, not as proof that the newest deployment is functioning.

## Current open checks — updated 2026-10-10
- GitHub Actions runner dispatch: current retries fail before first step (`runner_id=0`, `steps=[]`, no logs); execution of tests is unconfirmed. This is a runner allocation/dispatch failure, not evidence that the test commands themselves failed. The PHP namespace autoloader in code-check was corrected; a 12-assertion sanitizer regression test was added and passed in an isolated PHP 8.4 run using the repository class/test content, but has not yet run on GitHub Actions.
- Latest observed READY Vercel build is `e23fb882` and includes the Pass 44 source commit plus frontend proxy sanitizer, post-answer review restoration, and API timeout/cache fix. A newer docs-only `main` build (`701573ef`) was still BUILDING at last check. Live browser behavior remains unverified. SpaceWeb PHP deployment remains unverified because GitHub Actions jobs fail before checkout (`runner_id=0`, no steps/logs).
- P1 mitigation applied: base table access revoked for public client roles; safe view and server-side scoring RPC live; PHP/Next source sanitizers committed. Pass 44 (`99ed1bc`) also hardens PHP route membership checks for feed/detail/answer/image and recursively sanitizes nested question payloads. Full authenticated runtime acceptance and SpaceWeb PHP deployment remain open; details: [Pass 44 report](docs/SECURITY-FIX-2026-10-10-PASS44.md).
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
- Latest observed READY Vercel build (`e23fb882`) includes the Pass 44 source commit; newer docs-only build was still BUILDING at last check. Live browser/API verification remains separate from GitHub CI.
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
