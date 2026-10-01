# GPT / Supabase — Вариант A (исправлено под live UUID)

**Дата:** 2026-09-29  
**Причина стопа:** `exam_questions.id` в live = `uuid`, старый SQL давал строки `tkt-histology-...` → `ERROR 22P02`.

## Что выполнить

1. `docs/20260929_import_histology_exam_questions_uuid.sql` — 350 exam_questions, uuid
2. `docs/20260928_import_histology_tests.sql` — 163 MCQ

Или чанки: `docs/histology-sql-exam-questions-uuid/01.sql` … `18.sql`

**Не запускать** `20260928_import_histology_exam_questions_only.sql`

Полная задача: `docs/GPT-FULL-TASK-HISTOLOGY-IMPORT.md`
