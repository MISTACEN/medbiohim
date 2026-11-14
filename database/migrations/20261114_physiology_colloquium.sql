-- Коллоквиум по физиологии для МБХ-201 (осень 2026).
--
-- Почему отдельная запись расписания: /study и /academic/state показывают
-- готовность в процентах и строят план по дням только для аттестационных
-- событий (event_kind ∈ colloquium/control_work/credit/exam/assessment).
-- В импортированном официальном расписании таких событий не было ни одного —
-- были только занятия (309) и отработки (33), поэтому раздел подготовки
-- всегда оставался пустым.
--
-- Дата: понедельник 30.11.2026 — первый день физиологии после раздела «Кровь»
-- (лекции 10–12: эритроциты 09.11, лейкоциты и иммунитет 16.11, тромбоциты и
-- гемостаз 23.11). Время и пара — как у физиологии в этот день (12:50–14:30),
-- занятие идёт вместо практики; в notes это сказано явно.
--
-- Идемпотентно: повторный запуск не создаёт вторую запись.
BEGIN;

INSERT INTO public.schedule_entries (
  schedule_id, subject_id, date, start_time, end_time,
  type, event_kind, subject_name, notes, source, sort_order
)
SELECT
  s.id,
  (SELECT e.subject_id FROM public.schedule_entries e
    WHERE e.schedule_id = s.id AND e.subject_name = 'Физиология'
    ORDER BY e.date DESC LIMIT 1),
  DATE '2026-11-30',
  TIME '12:50',
  TIME '14:30',
  'seminar'::public.schedule_type,
  'colloquium',
  'Физиология',
  'Коллоквиум по разделу «Кровь»: эритроциты, лейкоциты и иммунитет, тромбоциты и гемостаз. Проводится вместо практического занятия.',
  'manual_colloquium_mb201_20261114',
  10
FROM public.schedules s
JOIN public.groups g ON g.id = s.group_id
WHERE g.code = 'МБХ-201'
  AND s.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.schedule_entries existing
    WHERE existing.schedule_id = s.id
      AND existing.date = DATE '2026-11-30'
      AND existing.event_kind = 'colloquium'
  );

COMMIT;
