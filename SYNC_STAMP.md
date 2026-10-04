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

