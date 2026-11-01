# Гистология: объединение дублей лекций (2026-11-01)

## Симптом

`hist-03-embriologiya` (и вся полная серия `hist-01…hist-08`) пропала из выдачи
предмета: лекции были в БД, но с `is_published = false`.

## Причина

`tools/lectures/link_plans.mjs` публиковал короткие «плановые» лекции
(`lec-hist-*`, 2–6 КБ) и снимал с публикации полную серию `hist-01…08` — она
числилась в списке `DUPLICATES`. Плюс в таблице лежали 11 заглушек
`histology-mbh-study-*-core` (1.3–2 КБ, без заголовков).

Замеры пересечения текстов (шинглы по 8 слов) показали 0.00–0.16: короткие
лекции — не производные полных, а самостоятельные конспекты. Поэтому дубли
не «удалялись», а **вливались** в полную лекцию темы.

## Что сделано

Канон — полная серия `hist-00…hist-08`. В неё влит текст дублей отдельным
разделом `## Дополнение: <название> (объединено)` с маркером
`<!-- MBH:MERGED:FROM <id> -->`; сам дубль снят с публикации (тело сохранено,
маркер `MBH:MERGED:INTO <канон>`).

| Дубль | Канон |
|---|---|
| `lec-hist-plan-01-20261008`, `histology-mbh-study-cytology-core` | `hist-01-citologiya-organelly` (2 доп.) |
| `lec-hist-cytology` | `hist-01-citologiya-organelly` |
| `lec-hist-embryology`, `histology-mbh-study-embryology-core` | `hist-03-embriologiya` |
| `lec-hist-epithelium`, `histology-mbh-study-epithelium-core` | `hist-04-epitelialnye-tkani` |
| `lec-histology-blood-20261008`, `histology-mbh-study-blood-core` | `hist-05-krov` |
| `lec-hist-connective`, `histology-mbh-study-connective-core` | `hist-06-sobstvenno-st` |
| `lec-hist-bone_muscle` | `hist-07-hryaschevye-kostnye` |
| `lec-hist-plan-08-20261008`, `histology-mbh-study-muscle-core` | `hist-08-myishechnye-tkani` |
| `histology-mbh-study-nervous-core` | `lec-hist-nerve_tissue` |
| `histology-mbh-study-cardiovascular-core` | `lec-hist-cvs` |
| `histology-mbh-study-digestive-core` | `lec-hist-stom_mbh` |
| `histology-mbh-study-respiratory-core` | `lec-hist-respiratory` |
| `histology-mbh-study-urinary-reproductive-core` | `lec-hist-reproductive` |

Дополнительно:

- недели плана 1–8 перенаправлены на канонические лекции
  (`site_content.subject_plan:histology`), тела 5 плановых лекций
  синхронизированы в `site_content.lectures`;
- объединённые плановые записи переведены в `curriculum.scope = "merged"`
  (`merged_into`), чтобы синк не публиковал их заново.

## Защита от повтора

`tools/lectures/link_plans.mjs`:

- список `ARCHIVED` содержит только архивные дубли — **полной серии там нет**;
- перед снятием публикации проверка: id вида `hist-0X` или тело ≥ 20 000 символов
  → пропуск с предупреждением (полноценная лекция не скрывается);
- `FULL_LECTURE_BY_WEEK` задаёт канон для недель 1–8, поэтому шаг привязки
  больше не теряет ссылки на полные лекции.

## Восстановление

Снимок состояния до операции: `%TEMP%/lectures-backup-before-merge.json`
(69 строк `histology_lectures` + 2 записи `site_content`, включая тела).
Откат одной лекции — `PATCH /rest/v1/histology_lectures?id=eq.<id>` с полями из
снимка. Повторный прогон объединения безопасен: маркеры `MBH:MERGED:FROM`
исключают двойную вставку.

## Состояние после операции

- опубликовано 26 лекций, в архиве 19;
- `hist-03-embriologiya` — 46 225 символов: §1–§8 (включая §7/§8 интерактива),
  плюс два раздела «Дополнение» и практический блок влитой плановой лекции.