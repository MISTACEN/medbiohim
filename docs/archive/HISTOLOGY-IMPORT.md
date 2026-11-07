# Histology content import

## Current state — 2026-10-04

Supabase:
- `exam_questions`: **366 published** (350 canonical + 16 unique ZIP additions; 100 exact-text ZIP duplicates archived)
- `ticket_banks`: **5**
- published tests for histology: **9**
- published materials for histology: **80**
- published trainer feed cards for histology: **206**
- trainer/atlas flow currently uses the subject's prepared 30-card dataset
- ticket rows: **0**

## Canonical import sources

### Exam questions
Use:
- `docs/histology-sql-exam-questions-uuid/01.sql` … `18.sql`

These are the UUID-safe chunks.

### Ticket banks
Use:
- `docs/histology-sql-tickets/00_banks.sql`

**Do not recreate existing ticket banks.**

### Electronogram captions
Use:
- `docs/20260928_sync_histology_em_captions.sql`
- `docs/20261001_fix_em_capillary_captions.sql`
- `docs/20260928_dedupe_histology_em_cards.sql`

### Tests
The target historical scope is:
- cytology: 96 MCQ
- embryology: 67 MCQ

Do not replace existing tests blindly. Validate the current nine published tests and test/question links first.

## Rules

- Do not use string UUIDs such as `bank-histology-*` or `tkt-histology-*`.
- Do not run the old string-id exam import.
- Do not touch other subjects while working on histology.
- Do not touch the five existing `ticket_banks` unless an explicit repair is required.
- Every import must end with a count check and a duplicate check.
- After content changes update [../ROADMAP.md](../ROADMAP.md) and [../PHASES_STATUS.md](../PHASES_STATUS.md).
