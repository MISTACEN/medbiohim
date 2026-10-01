# Histology import package (UUID-ready for live Supabase)

Parts: **20** (`part01.txt` … `part20.txt`)

```bash
cat docs/histology-import-package-b64/part*.txt | tr -d '\n' | base64 -d > histology-import-uuid.zip
unzip histology-import-uuid.zip
```

Contents after unzip:
- `20260929_import_histology_exam_questions_uuid.sql` — 350 exam_questions, **uuid** ids
- `20260928_import_histology_tests.sql` — 163 MCQ
- `histology-sql-exam-questions-uuid/01.sql` … `18.sql`
- `histology-exam-questions-id-map.json`
- `GPT-FULL-TASK-HISTOLOGY-IMPORT.md`

**Do not** use old `20260928_import_histology_exam_questions_only.sql` (string ids → 22P02).

Also on repo already:
- `docs/GPT-FULL-TASK-HISTOLOGY-IMPORT.md`
- `docs/histology-sql-exam-questions-uuid/18.sql`
