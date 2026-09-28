# Полный пакет данных histology (zip, base64)

Частей: 36

```bash
cat docs/histology-data-b64/*.txt | grep -v '^#' | tr -d '\n' | base64 -d > histology-data.zip
unzip histology-data.zip
```

Внутри zip:
- docs/histology-sql-exam-questions/01.sql … 18.sql (~350 exam_questions)
- docs/histology-import/slim01.json … slim10.json
- docs/20260928_import_histology_exam_questions_only.sql
- docs/20260928_import_histology_tests.sql (163 MCQ)
- docs/histology-tests-cyto-embryo.json
- backend/data/tests.json, questions_bank.json, questions_by_subject/histology.json, tickets_bank.json

После распаковки:
1. SQL `docs/histology-sql-exam-questions/*.sql` по порядку (banks UUID уже есть — только exam_questions)
2. Тесты: `docs/20260928_import_histology_tests.sql`
3. Или REST: `python3 docs/import_histology_tickets_rest.py`
