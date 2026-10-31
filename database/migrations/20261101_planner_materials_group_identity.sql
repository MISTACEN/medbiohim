-- 2026-11-01 · Единый план по темам + идентичность группы.
--
-- 1. Открытые материалы: подсказка «что ещё не открыто» должна переживать
--    смену устройства, поэтому факт открытия хранится на сервере — приватно,
--    RLS owner-only, как topic_progress.
-- 2. Курс студента: группа имеет стабильный id, а курс считается от года
--    поступления. Для академотпуска/второгодника курс можно заморозить
--    персонально (course_override), не меняя группу и не теряя историю.

create table if not exists public.material_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (user_id, material_id)
);

create index if not exists material_views_user_idx on public.material_views (user_id);
create index if not exists material_views_material_idx on public.material_views (material_id);

alter table public.material_views enable row level security;

drop policy if exists material_views_select_own on public.material_views;
create policy material_views_select_own
  on public.material_views for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists material_views_insert_own on public.material_views;
create policy material_views_insert_own
  on public.material_views for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists material_views_update_own on public.material_views;
create policy material_views_update_own
  on public.material_views for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists material_views_delete_own on public.material_views;
create policy material_views_delete_own
  on public.material_views for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.material_views to authenticated;

-- Персональная заморозка курса: null — курс считается автоматически от
-- admission_year; 1…8 — курс зафиксирован (академотпуск, второгодник).
alter table public.group_memberships
  add column if not exists course_override smallint;

-- Поток и подгруппа уже могли быть добавлены более ранней миграцией;
-- повторяем идемпотентно, чтобы этот файл можно было катить отдельно.
-- groups.semester читают маршруты групп и старосты (текущий семестр группы).
alter table public.groups add column if not exists stream text;
alter table public.groups add column if not exists semester smallint;
alter table public.group_memberships add column if not exists subgroup text;

-- Материал может ссылаться на тему программы: из этой связи план темы
-- показывает чипы материалов и считает «что ещё не открыто».
alter table public.materials
  add column if not exists topic_id uuid references public.topics(id) on delete set null;

create index if not exists materials_topic_published_idx
  on public.materials(topic_id) where is_published = true;

-- Индекс для вопросов к экзамену по теме: колонка plan_topic_id уже
-- используется в plan-progress, но индекс проверяем по каталогу, потому что
-- на старых базах её может не быть.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_questions' and column_name = 'plan_topic_id'
  ) then
    execute 'create index if not exists exam_questions_plan_topic_idx on public.exam_questions(plan_topic_id)';
  end if;
end $$;

-- Ежедневный cron пересчитывает курс группы от года поступления: 1 сентября
-- все активные группы сами переходят на следующий курс, id группы не меняется.
-- Обновляются только реально изменившиеся строки, поэтому повторный запуск
-- ничего не пишет. Год поступления вне 1990…2100 и курс вне 1…8 не трогаем.
create or replace function public.medbiohim_rollover_group_courses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_academic_year integer := extract(year from (now() at time zone 'utc'))::int
    - case when extract(month from (now() at time zone 'utc')) >= 9 then 0 else 1 end;
begin
  update public.groups g
     set course_number = v_academic_year - g.admission_year + 1
   where g.is_active is not false
     and g.admission_year between 1990 and 2100
     and v_academic_year - g.admission_year + 1 between 1 and 8
     and g.course_number is distinct from v_academic_year - g.admission_year + 1;
  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated, 'academic_year_start', v_academic_year, 'ran_at', now());
end;
$$;

revoke all on function public.medbiohim_rollover_group_courses() from public, anon, authenticated;
grant execute on function public.medbiohim_rollover_group_courses() to service_role;
