# ChatGPT / Supabase — гистология (MEDBIOHIM)

**Дата:** 2026-09-28 (обновлено после частичного импорта)
**Репо:** MISTACEN/medbiohim `main`

## Фактическое состояние БД (после GPT-прогона)

| Объект | Count |
|--------|-------|
| EM cards | 27 (после дедупа) |
| EM с captions | 27/27 |
| ticket_banks histology | 5 (UUID id) |
| exam_questions histology | 0 ← **нужно импортировать** |
| tests histology | 5 (из них 2×20 закрытых цито/эмбрио — не полные 163) |

## Важно про схему

- `ticket_banks.id` = **UUID**. Строки `bank-histology-lech-ped` **не вставлять**.
- Пул билетов: `exam_questions` WHERE `subject_slug='histology'`.
- `is_skipped` / `is_correct` = boolean → никогда `''` (SpaceWeb trainings.php).

## Что сделать дальше (порядок)

### A. exam_questions (~350)
1. Выполнить по порядку `docs/histology-sql-exam-questions/01.sql` … `18.sql`
2. Или REST: `docs/import_histology_tickets_rest.py` + `docs/histology-import/questions-part*.json`
3. Проверка: `SELECT COUNT(*) FROM exam_questions WHERE subject_slug='histology';` → ~350

### B. Тесты 163 MCQ
1. `docs/histology-sql-tests/*.sql` или полный `docs/20260928_import_histology_tests.sql`
2. Адаптируй колонки (`is_active` vs `is_published`) под живую схему
3. Не подменяй целевые 96+67 имеющимися 20+20

### C. Уже сделано — не повторять
- EM captions + dedupe
- 5 ticket banks

### D. Вне SQL
- SpaceWeb: trainings.php boolean bind; data JSON fallback
- Медиа 404 = storage, не SQL

## Файлы

```text
docs/histology-sql-exam-questions/     ← SQL чанки билетов
docs/histology-import/questions-part*.json
docs/import_histology_tickets_rest.py
docs/histology-sql-tests/              ← SQL чанки тестов
docs/20260928_sync_histology_em_captions.sql  (done)
docs/20260928_dedupe_histology_em_cards.sql   (done)
```
