-- 20261104_knowledge_pyramid.sql
--
-- Трёхуровневая пирамида знаний для общей образовательной модели
-- (раздел 6 задания) и атрибуция источника у материала (раздел 19).
--
-- Миграция ТОЛЬКО аддитивная:
--   * новые nullable-колонки, без backfill и без изменения существующих значений;
--   * RLS и права не затрагиваются;
--   * CHECK допускает NULL, поэтому старые строки остаются валидными;
--   * повторный запуск безопасен (IF NOT EXISTS / проверка pg_constraint).
--
-- Уровни: 1 — база, 2 — понимание, 3 — применение.
-- source_attribution: {title, author, organization, year, url, kind, limitations}
--   где kind ∈ scientific_fact | teaching_model | simplified_simulation |
--             assumption | unverified.

alter table public.topics
  add column if not exists knowledge_level smallint;

alter table public.materials
  add column if not exists knowledge_level smallint;

alter table public.materials
  add column if not exists source_attribution jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'topics_knowledge_level_check'
      and conrelid = 'public.topics'::regclass
  ) then
    alter table public.topics
      add constraint topics_knowledge_level_check
      check (knowledge_level is null or knowledge_level between 1 and 3);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'materials_knowledge_level_check'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_knowledge_level_check
      check (knowledge_level is null or knowledge_level between 1 and 3);
  end if;
end $$;

create index if not exists topics_knowledge_level_idx
  on public.topics (knowledge_level)
  where knowledge_level is not null;

create index if not exists materials_knowledge_level_idx
  on public.materials (knowledge_level)
  where knowledge_level is not null;

comment on column public.topics.knowledge_level is
  'Уровень пирамиды знаний: 1 — база, 2 — понимание, 3 — применение. NULL — не размечено.';

comment on column public.materials.knowledge_level is
  'Уровень пирамиды знаний для материала: 1 — база, 2 — понимание, 3 — применение.';

comment on column public.materials.source_attribution is
  'Атрибуция источника: {title, author, organization, year, url, kind, limitations}. kind отделяет научный факт от учебной модели и непроверенного материала.';
