-- MEDBIOHIM: личные события студента из внешнего календаря (iCal)
--
-- Расписание вуза живёт в schedule_entries и привязано к учебной группе.
-- Персональный iCal-фид (ЭИОС, Google Calendar, почта) — это данные студента,
-- поэтому отдельная user-scoped таблица: чужая группа не должна их видеть,
-- а синхронизация не имеет права трогать учебное расписание.
--
-- Upsert идёт по (user_id, external_id), где external_id — UID из VEVENT.
-- topic_id заполняется один раз при первом импорте и дальше не перезаписывается,
-- чтобы ручная привязка темы не терялась при каждой синхронизации.
create table if not exists public.user_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  title text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  description text,
  source text not null default 'ical' check (source in ('ical', 'manual')),
  source_url text,
  content_hash text not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists idx_user_calendar_events_user_start
  on public.user_calendar_events(user_id, starts_at);

alter table public.user_calendar_events enable row level security;

drop policy if exists "user calendar events own rows" on public.user_calendar_events;
create policy "user calendar events own rows" on public.user_calendar_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_calendar_events to authenticated;
