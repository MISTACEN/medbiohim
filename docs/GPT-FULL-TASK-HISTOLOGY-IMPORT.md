# Полная задача для ChatGPT / Supabase — гистология MEDBIOHIM

**Дата:** 2026-09-29  
**Проект:** MEDBIOHIM (Sechenov school platform)  
**Твоя роль:** выполнить SQL-импорт в **live Supabase**. Не выдумывать данные. Не менять схему без явной ошибки.

---

## Контекст (что уже есть в БД)

| Объект | Состояние |
|--------|-----------|
| `ticket_banks` histology | **5 UUID** — **не трогать**, не INSERT |
| `exam_questions` histology | **0** (импорт остановился из‑за строковых id) |
| EM карточки | **27** уникальных, captions **27/27** |
| Старые tests histology | 5 тестов / 100 questions — можно оставить; новые 2 теста добавятся поверх |
| Live: `exam_questions.id` | **uuid** (`gen_random_uuid` default) |
| Live: `tests` / `questions` / `test_questions` | **uuid** |
| `is_skipped` / `is_correct` | **boolean** (не text, не `''`) |
| `tests.is_published` | есть (не `is_active`) |
| `questions.options` | **jsonb** |

---

## Приложенные файлы (обязательно использовать)

| Файл | Зачем |
|------|--------|
| `20260929_import_histology_exam_questions_uuid.sql` | **350** exam_questions, id уже `uuid` |
| `20260928_import_histology_tests.sql` | 2 теста (цито + эмбрио), **163** MCQ |
| `histology-sql-exam-questions-uuid/01.sql` … `18.sql` | то же, что exam, по частям если Editor режет |
| `histology-exam-questions-id-map.json` | справочник legacy string → uuid (не для INSERT) |

### Запрещено запускать

- `20260928_import_histology_exam_questions_only.sql` — строковые id → `ERROR 22P02`
- любые SQL с `VALUES ('tkt-histology-...` без `::uuid`
- INSERT в `ticket_banks` с id вида `bank-histology-*`

---

## Порядок работы (строго)

### Шаг 0 — проверка схемы (1 запрос)

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'exam_questions'
  AND column_name IN ('id','subject_slug','text','answer','kind','type','for_exam','for_ticket','is_published');
```

Ожидание: `id` → `uuid`. Если нет колонок из INSERT — **стоп** и опиши фактические колонки.

### Шаг 1 — exam_questions (350)

Выполни **целиком**:

`20260929_import_histology_exam_questions_uuid.sql`

Внутри уже `BEGIN` / `COMMIT`, id вида:

```sql
VALUES ('da0f7d5b-6d5a-52b5-b3af-4a458528c2f7'::uuid, ...
ON CONFLICT (id) DO UPDATE SET ...
```

UUID детерминированные (uuid5 от legacy id) — повторный прогон безопасен.

**Если SQL Editor / лимит размера падает:**  
по порядку `histology-sql-exam-questions-uuid/01.sql` → `18.sql`  
(BEGIN в 01, COMMIT в 18).

Проверка:

```sql
SELECT COUNT(*) AS exam_q
FROM public.exam_questions
WHERE subject_slug = 'histology';
-- цель: ≈ 350
```

### Шаг 2 — closed tests (163 MCQ)

Выполни **целиком**:

`20260928_import_histology_tests.sql`

- Резолвит `subject_id` по `slug/code = histology` или `name ILIKE '%гистолог%'`
- 2 теста: «Цитология (закрытые тесты)», «Эмбриология (закрытые тесты)»
- INSERT в `tests`, `questions`, `test_questions`
- id уже uuid

Проверка:

```sql
SELECT t.id, t.title, COUNT(tq.question_id) AS qn
FROM public.tests t
LEFT JOIN public.test_questions tq ON tq.test_id = t.id
WHERE t.title ILIKE '%цитолог%'
   OR t.title ILIKE '%эмбриолог%'
GROUP BY t.id, t.title
ORDER BY t.title;
-- цель: 2 новых (или обновлённых) теста, сумма qn ≈ 163
```

### Шаг 3 — итоговый отчёт (обязателен)

```sql
SELECT 'exam_questions_histology' AS metric, COUNT(*)::text AS n
FROM public.exam_questions WHERE subject_slug = 'histology'
UNION ALL
SELECT 'ticket_banks_histology', COUNT(*)::text
FROM public.ticket_banks WHERE title ILIKE '%гистолог%'
UNION ALL
SELECT 'tests_cyto_embryo', COUNT(*)::text
FROM public.tests
WHERE title ILIKE '%цитолог%' OR title ILIKE '%эмбриолог%'
UNION ALL
SELECT 'test_questions_linked', COUNT(*)::text
FROM public.test_questions tq
JOIN public.tests t ON t.id = tq.test_id
WHERE t.title ILIKE '%цитолог%' OR t.title ILIKE '%эмбриолог%';
```

| Метрика | Цель |
|---------|------|
| exam_questions histology | **~350** |
| ticket_banks histology | **5** (без изменений) |
| tests цито + эмбрио | **≥2** |
| test_questions linked | **~163** |

---

## Правила

1. Не генерируй 350 вопросов вручную — они в SQL.
2. Не меняй ticket_banks.
3. При ошибке схемы — стоп, покажи ошибку, не чини наугад.
4. Не пиши is_skipped='' / is_correct=''.
5. Медиа 404 и PHP SpaceWeb — вне этой задачи.

## Краткий prompt

```text
Live Supabase MEDBIOHIM. exam_questions.id = uuid.
1) 20260929_import_histology_exam_questions_uuid.sql → ~350
2) 20260928_import_histology_tests.sql → 2 теста, ~163 MCQ
НЕ запускай старый SQL со строками tkt-histology-...
НЕ трогай ticket_banks (5).
После верни COUNT и отчёт.
```
