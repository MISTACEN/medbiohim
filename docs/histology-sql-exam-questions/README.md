# exam_questions import (histology)

## Live DB facts (confirmed)
- `ticket_banks.id` = **UUID** (5 histology banks already exist)
- Do **not** insert `bank-histology-*` string IDs
- Banks resolve pool via `subject_slug = 'histology'` (see ExamQuestionStore.generate)
- EM: 27 cards after dedupe, all with captions ✓

## Import exam questions (~350)

Run SQL parts **in order** from this folder:
```text
01.sql
02.sql
…
18.sql
```

Or REST:
```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 docs/import_histology_tickets_rest.py
```
(uses `docs/histology-import/questions-part*.json`)

### Verify
```sql
SELECT COUNT(*) FROM exam_questions WHERE subject_slug = 'histology';
-- expect ~350
SELECT id, title, subject_slug FROM ticket_banks WHERE subject_slug = 'histology';
```

## Tests (163 MCQ cyto+embryo)
Files: `docs/histology-sql-tests/*.sql` or `docs/20260928_import_histology_tests.sql`
Adapt `is_published` vs `is_active` to live schema.
Target ids:
- histology-cyto-closed-2007 (96)
- histology-embryo-closed-2007 (67)
- histology-cyto-embryo-mixed-2007 (163)

Existing 20+20 closed tests are **not** a substitute — different question set.
