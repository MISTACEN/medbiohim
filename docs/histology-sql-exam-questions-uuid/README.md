# exam_questions histology — UUID chunks

Live schema: `exam_questions.id` = **uuid**.

Run in order:

```text
01.sql … 18.sql
```

- BEGIN in `01.sql`
- COMMIT in `18.sql`
- Deterministic uuid5 from legacy string ids
- Full single file: `../20260929_import_histology_exam_questions_uuid.sql`
- Tests: `../20260928_import_histology_tests.sql`
- Full task: `../GPT-FULL-TASK-HISTOLOGY-IMPORT.md`

Do **not** use `20260928_import_histology_exam_questions_only.sql` (string ids).
