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
