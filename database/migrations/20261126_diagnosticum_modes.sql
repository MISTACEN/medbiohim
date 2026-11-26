-- Режимы диагностикума: добавляем exam и electronogram.
--
-- Причина: check-ограничение из 20261120_diagnosticum.sql перечисляет режимы
-- явно и не знало о новых. Вставка попытки падала с 23514, API отвечал 503,
-- то есть «Экзамен» и «Электронограмма» были недоступны в production.
--
-- Миграция аддитивная: существующие строки (complex/identify/structures) не
-- затрагиваются, старые значения остаются разрешёнными. Идемпотентна: повторный
-- запуск пересоздаёт то же ограничение.

alter table public.diagnosticum_attempts
  drop constraint if exists diagnosticum_attempts_mode_check;

alter table public.diagnosticum_attempts
  add constraint diagnosticum_attempts_mode_check
  check (mode = any (array[
    'identify'::text,
    'structures'::text,
    'differential'::text,
    'complex'::text,
    'schema'::text,
    'exam'::text,
    'electronogram'::text
  ]));

comment on constraint diagnosticum_attempts_mode_check on public.diagnosticum_attempts is
  'Режимы диагностикума: препараты (identify/structures/differential/complex/schema), экзамен и электронограммы.';
