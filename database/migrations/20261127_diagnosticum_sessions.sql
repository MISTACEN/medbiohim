-- Серверная сессия диагностикума: серия вопросов живёт в БД, а не в браузере.
--
-- Раньше серия экзамена собиралась на клиенте в sessionStorage: после
-- перезагрузки терялся номер вопроса, а «пропуски» считались по последней
-- попытке. Теперь сессия, её состав и разбор хранятся на сервере.
--
-- Миграция аддитивная: новая таблица + два необязательных столбца у попыток.
-- Существующие попытки (session_id = null) работают как одиночные задания.

begin;

create table if not exists public.diagnosticum_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in (
    'identify','structures','differential','complex','schema','exam','electronogram'
  )),
  section text not null default '',
  session_length integer not null default 1 check (session_length between 1 and 30),
  timer_sec integer check (timer_sec is null or (timer_sec between 10 and 3600)),
  status text not null default 'in_progress' check (status in ('in_progress','finished','abandoned')),
  attempt_ids uuid[] not null default '{}',
  score integer check (score is null or (score between 0 and 100)),
  correct_count integer check (correct_count is null or correct_count >= 0),
  total_count integer check (total_count is null or total_count >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.diagnosticum_attempts
  add column if not exists session_id uuid references public.diagnosticum_sessions(id) on delete set null;
-- Порядок внутри серии фиксируется числом: одинаковые created_at иначе
-- перемешивают вопросы при восстановлении.
alter table public.diagnosticum_attempts
  add column if not exists session_index integer;

create index if not exists diagnosticum_sessions_user_idx
  on public.diagnosticum_sessions (user_id, created_at desc);
create index if not exists diagnosticum_attempts_session_idx
  on public.diagnosticum_attempts (session_id, session_index);

alter table public.diagnosticum_sessions enable row level security;

-- Читать свою сессию можно токеном пользователя, писать — только сервер.
drop policy if exists "diagnosticum_sessions_own_select" on public.diagnosticum_sessions;
create policy "diagnosticum_sessions_own_select"
  on public.diagnosticum_sessions for select to authenticated
  using (user_id = auth.uid());

revoke all on public.diagnosticum_sessions from anon;
revoke insert, update, delete on public.diagnosticum_sessions from authenticated;
grant select on public.diagnosticum_sessions to authenticated;

commit;
