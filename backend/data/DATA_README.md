# backend/data — контент MEDBIOHIM

## Источник истины для импорта в Supabase

Репозиторий: `MISTACEN/medbiohim` · branch `main`

| Файл / папка | Назначение |
|------|------------|
| `schedule.json` | Полное расписание (когда файл большой — см. `schedule_parts/`) |
| `schedule_parts/schedule_YYYY-MM.json` | Расписание по месяцам, МБ-201, осень 2026/2027 |
| `questions_by_subject/*.json` | Экзаменационные вопросы (`kind=ticket`) |
| `tickets_by_subject/ticket_bank_*.json` | Банки генератора билетов |
| `subjects_catalog.json` | Каталог предметов |
| `subject_plans.json` | Планы занятий |

### Правила
1. Все вопросы → `exam_questions`, `kind='ticket'`, `for_exam=true`.
2. Предмет **Неорганическая химия** (`inorganic_chemistry`). **Не использовать** HOBA/ХОБА.
3. `schedule_entries`: `date`, `start_time`, `end_time`, `subject_name`, `type`, группа **МБ-201**.
4. Проверка: `date between '2026-09-14' and '2026-09-19'` — не пусто (~15–25 строк).
