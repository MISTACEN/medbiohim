# Следующий прогон ChatGPT (после частичного импорта)

## Уже в БД — не трогать
- EM 27 + captions 27
- ticket_banks × 5 (UUID)
- существующие tests 20+20 цито/эмбрио (не полные 163)

## Сделать

### 1. exam_questions (~350)
Источник в репо (по мере появления):
- `docs/histology-sql-exam-questions/01.sql` … `18.sql`
- или `docs/histology-import/slim01.json` … + `python3 docs/import_histology_tickets_rest.py`

Если файлов ещё нет в main — взять из локальных artifacts Grok:
- `docs/20260928_import_histology_exam_questions_only.sql`
- `backend/data/questions_bank.json`

**Не создавать** bank-histology-* string IDs.

Проверка:
```sql
SELECT COUNT(*) FROM exam_questions WHERE subject_slug='histology';
```
Ожидание: ~350.

### 2. Тесты 163 MCQ
Файл: `docs/20260928_import_histology_tests.sql` (artifacts) или `docs/histology-sql-tests/`.
Целевые id:
- histology-cyto-closed-2007 (96)
- histology-embryo-closed-2007 (67)
Не заменять 20+20 — добавить полные наборы.

### 3. Вернуть counts
```sql
SELECT COUNT(*) FROM exam_questions WHERE subject_slug='histology';
SELECT id, title FROM tests WHERE subject_slug='histology';
```
