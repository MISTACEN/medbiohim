-- 2026-11-01 · Гистология, лекция hist-03-embriologiya: интерактивные блоки
-- «Подготовка к самостоятельной» (```selfwork) и «Режим экзамена» (```exam).
--
-- В body_markdown кладутся ТОЛЬКО фенсы с lectureId и заголовки § 7/§ 8.
-- Сам контент (открытые вопросы, эталоны, образцовый разбор ошибок, шкала
-- 3/4/5, электронограммы, памятка) живёт в репозитории:
--   src/lib/histology/embryologySelfWork.ts
-- LectureRenderer подключает его по lectureId из JSON-спеки фенса, поэтому
-- дублировать вопросы в БД не нужно.
--
-- Идемпотентно: блок добавляется только если маркера
-- <!-- MBH:SELFWORK:hist-03-embriologiya --> ещё нет (position(...) = 0 и
-- NOT LIKE '%MBH:SELFWORK%'). Повторный прогон не дублирует разметку.
-- Никаких DROP/DELETE — только UPDATE одной строки.
--
-- Тот же результат даёт scripts/apply-embryology-selfwork.mjs (--apply);
-- скрипт удобен для dry-run и точечного применения, миграция — для psql.

-- Страховка: миграция осмысленна только при существующей строке лекции.
do $guard$
begin
  if not exists (select 1 from public.histology_lectures where id = 'hist-03-embriologiya') then
    raise exception 'histology_lectures: строка hist-03-embriologiya не найдена — нечего обновлять';
  end if;
end
$guard$;

update public.histology_lectures
set body_markdown = coalesce(body_markdown, '')
    || case
         when coalesce(body_markdown, '') = '' then ''
         when right(coalesce(body_markdown, ''), 2) = E'\n\n' then ''
         when right(coalesce(body_markdown, ''), 1) = E'\n' then E'\n'
         else E'\n\n'
       end
    || $mbh_selfwork_hist03$<!-- MBH:SELFWORK:hist-03-embriologiya -->
## § 7. Подготовка к самостоятельной (открытые вопросы)

Интерактив: только открытые вопросы без вариантов ответа — письменный ответ, проверка с разбором ошибок, образцовый ответ и повторное прохождение вопросов, где были ошибки.

```selfwork
{"lectureId": "hist-03-embriologiya"}
```

## § 8. Режим экзамена (самостоятельная работа)

Интерактив: три задания как на реальной самостоятельной — осевые органы по памяти, электронограмма половой клетки (определить и подписать структуры) и развёрнутый теоретический вопрос; оценка 3/4/5 с пояснениями.

```exam
{"lectureId": "hist-03-embriologiya"}
```
$mbh_selfwork_hist03$,
    updated_at = now()
where id = 'hist-03-embriologiya'
  and position('MBH:SELFWORK' in coalesce(body_markdown, '')) = 0
  and coalesce(body_markdown, '') not like '%MBH:SELFWORK%';

-- Контроль (выполнить отдельно, если нужно убедиться в результате):
-- select id,
--        length(body_markdown)                                   as body_len,
--        position('MBH:SELFWORK' in body_markdown) > 0           as has_selfwork_marker,
--        position('```selfwork' in body_markdown) > 0            as has_selfwork_fence,
--        position('```exam' in body_markdown) > 0                as has_exam_fence
--   from public.histology_lectures
--  where id = 'hist-03-embriologiya';
