# Органическая химия — интеграция в MEDBIOHIM (2026-09-29)

## Что добавлено
- **260 открытых задач** (сборник ДВГМУ) → `questions_bank` + `questions_by_subject/organic_chemistry.json`
- **101 тест** (ДВГМУ 2016) в **18 пакетах** по темам → `tests.json` (`t-orgchem-*`)
- SQL upsert в `exam_questions` (UUID): `docs/20260929_import_organic_chemistry_exam_questions_uuid.sql`
- subject_slug: **`organic_chemistry`** (уже в `subjects_catalog.json`)

## Деплой
1. **GitHub main** — этот коммит (Vercel подхватит bank/tests).
2. **Supabase**: выполнить SQL `docs/20260929_import_organic_chemistry_exam_questions_uuid.sql` (UUID ids).
3. **SpaceWeb**: залить `spaceweb_upload/data/questions_bank.json`, `tests.json`, `questions_by_subject/organic_chemistry.json`.
4. Проверка UI: `/subjects/organic_chemistry`, practice/tickets, `/search` по оргхимии.

## Исходники извлечения
- `orgchem_tasks_full.json` / `.md`
- `orgchem_tests_dvgmu_2016.json` / `.md` (+ answers)
