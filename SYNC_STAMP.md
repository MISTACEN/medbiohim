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
- Code Checks currently red because of literal escaped newline in HistologyTrainer.tsx:248
- Active frontend calls to missing /api-compat routes
- Vercel production smoke-test after latest frontend corrections
- SpaceWeb media 404/502 for trainer feed images
- AI provider runtime health / fallback chain
- Full histology plan ↔ content mapping
- Admin quick-edit completion

## Rule
After a significant change, update ROADMAP.md and PHASES_STATUS.md. Do not mark a task ✅ until it is verified in the target environment.
