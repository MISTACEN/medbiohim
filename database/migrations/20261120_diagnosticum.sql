-- Диагностикум гистологии: попытки студента.
--
-- Одна строка = одно задание. Вопрос и правильные ответы рождаются на сервере
-- (`workers/api/src/routes/diagnosticum`), поэтому колонка `answers` содержит
-- ключ и не выдаётся клиенту: колоночные гранты ниже отдают только безопасные
-- поля. Клиент узнаёт правильные ответы лишь после POST /diagnosticum/answer.
--
-- Файл идемпотентен.

create table if not exists public.diagnosticum_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  mode        text not null check (mode in ('identify', 'structures', 'differential', 'complex', 'schema')),
  section     text not null default '',
  guide_key   text not null,
  card_id     uuid,
  question    jsonb not null,
  answers     jsonb not null,
  hints       jsonb not null default '[]'::jsonb,
  hints_used  integer not null default 0,
  correct     boolean,
  score       integer,
  feedback    jsonb,
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists diagnosticum_attempts_user_created_idx
  on public.diagnosticum_attempts (user_id, created_at desc);
create index if not exists diagnosticum_attempts_user_section_idx
  on public.diagnosticum_attempts (user_id, section);
create index if not exists diagnosticum_attempts_guide_idx
  on public.diagnosticum_attempts (guide_key);

alter table public.diagnosticum_attempts enable row level security;

-- Студент видит и меняет только свои попытки: чужая статистика недоступна.
drop policy if exists diagnosticum_attempts_own on public.diagnosticum_attempts;
create policy diagnosticum_attempts_own on public.diagnosticum_attempts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.diagnosticum_attempts from anon, authenticated;
grant select (
  id, user_id, mode, section, guide_key, card_id, question,
  hints, hints_used, correct, score, feedback, created_at, answered_at
) on public.diagnosticum_attempts to authenticated;
grant insert, update on public.diagnosticum_attempts to authenticated;

comment on table public.diagnosticum_attempts is
  'Попытки диагностикума: вопрос и ключ ответа формируются сервером, ключ (answers) клиенту не выдаётся.';
