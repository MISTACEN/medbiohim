# Полный пакет данных histology

## Важно
Части `02.txt`–`04.txt` временно повреждены (placeholder) — **не использовать** до перезаливки.
Часть `01.txt` — валидна.

## Полные данные
Все SQL/JSON **готовы локально в artifacts** проекта Grok:
- `docs/histology-sql-exam-questions/01.sql` … `18.sql`
- `docs/20260928_import_histology_exam_questions_only.sql` (~350 вопросов)
- `docs/20260928_import_histology_tests.sql` (163 MCQ)
- `docs/histology-import/slim01.json` … `slim10.json`
- `backend/data/questions_bank.json`, `tests.json`

## Для GPT / Supabase прямо сейчас
1. Возьми SQL из artifacts (или попроси Grok дозаливать оставшиеся файлы без placeholder).
2. Выполни `01.sql`…`18.sql` по порядку (banks UUID уже есть).
3. Тесты: `20260928_import_histology_tests.sql`.
4. Проверка: `SELECT COUNT(*) FROM exam_questions WHERE subject_slug='histology';` → ~350.

## Сборка zip (когда все 36 частей валидны)
```bash
cat docs/histology-data-b64/*.txt | tr -d '\n' | base64 -d > histology-data.zip
unzip histology-data.zip
```
