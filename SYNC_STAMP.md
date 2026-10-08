# Sync stamp

- Date: 2026-10-04
- Branch: main
- Source of truth: GitHub main + Supabase + target deployment environments
- Documentation baseline: ROADMAP.md + PHASES_STATUS.md + docs/README.md
- Full audit: docs/FULL-AUDIT-2026-10-04.md
- Unfinished registry: docs/UNFINISHED-REGISTRY.md
- API coverage audit: docs/API-COVERAGE-2026-10-04.md

## Current verified data
- Supabase histology `exam_questions`: 350
- Histology `ticket_banks`: 5
- Published histology materials: 27
- Published histology trainer feed cards: 206
- Canonical histology trainer/atlas cards used by the current subject flow: 30
- Published tests total: 33
- Published questions total: 855

## Current open checks
- latest code-check after Deep Audit documentation commit: running
- Vercel target deployment after latest commits
- SpaceWeb backend target deployment after latest backend commits
- trainer feed media 404/502 physical verification
- AI provider runtime/fallback verification
- final histology plan ↔ content matrix
- admin CMS material/trainer/version-history completion
- duplicate route consolidation (after contract audit)

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
- Vercel production deployment lag/verification remains separate from GitHub CI.
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
