-- Фаза 5 дорожной карты (docs/AI-STUDY-ROADMAP.md §2.4): единая лента событий
-- студента — вход для рекомендаций, слабых мест и отчётов ночного агента.
--
-- Запись только служебным клиентом (service_role обходит RLS): у authenticated
-- нет политик на insert/update/delete, поэтому подделать свою историю нельзя.
-- Чтение — строго свои строки.
--
-- Применено в production 2026-11-14 (проверено по pg_class/pg_policy: RLS
-- включён, политика owner-select одна, индексы на месте). Файл — копия
-- применённой версии; повторный запуск идемпотентен (if not exists / drop policy).

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- kind валидируется в коде (ACTIVITY_KINDS), чтобы новые виды событий
  -- не требовали миграции на каждую фичу.
  kind text not null,
  subject_slug text,
  ref_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_user_created_idx
  on public.activity_events(user_id, created_at desc);

-- Чистка по сроку хранения (cron удаляет старше 180 дней).
create index if not exists activity_events_created_idx
  on public.activity_events(created_at);

alter table public.activity_events enable row level security;

drop policy if exists activity_events_owner_select on public.activity_events;

create policy activity_events_owner_select on public.activity_events
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.activity_events from anon;
-- Запись — только служебному клиенту: RLS уже не пускает (нет write-политик),
-- но и табличные права убираем, чтобы модель прав не расходилась с моделью доступа.
revoke insert, update, delete, truncate on public.activity_events from authenticated;
grant select on public.activity_events to authenticated;

comment on table public.activity_events is
  'Лента учебных событий студента: тесты, лекции, тьютор, SRS, ДЗ, отработки.';
