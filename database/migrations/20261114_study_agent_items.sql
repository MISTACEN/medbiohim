-- Фаза 2.6 дорожной карты (docs/AI-STUDY-ROADMAP.md): ночной агент к экзамену.
--
-- Агент раскладывает банк вопросов кафедры по дням до экзамена: каждый вечер
-- генерируются разборы «на завтра», утром студент видит вопросы и отмечает
-- разобранные. Разбор — эталонный ответ из банка (детерминированный), поэтому
-- ночная ветка не зависит от доступности ИИ и не тратит квоты.
--
-- Запись — только служебным клиентом (cron + создание плана). Студенту разрешено
-- ровно одно изменение: отметить пункт разобранным (колонка done).
--
-- Применение: файл НЕ применён к базе. Применить отдельным разрешённым
-- действием, затем сверить с live ledger.

create table if not exists public.study_agent_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  question_id uuid,
  question_text text not null,
  answer text,
  topic text,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Идемпотентность ночной ветки: один вопрос — один раз на день в плане.
create unique index if not exists study_agent_items_plan_day_question_idx
  on public.study_agent_items(plan_id, day, question_text);

create index if not exists study_agent_items_owner_day_idx
  on public.study_agent_items(user_id, day);

alter table public.study_agent_items enable row level security;

drop policy if exists study_agent_items_owner_select on public.study_agent_items;
create policy study_agent_items_owner_select on public.study_agent_items
  for select to authenticated
  using (user_id = auth.uid());

-- Отметить разобранным можно только свой пункт, и менять — только `done`
-- (права на остальные колонки не выдаются).
drop policy if exists study_agent_items_owner_update on public.study_agent_items;
create policy study_agent_items_owner_update on public.study_agent_items
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.study_agent_items from anon;
revoke insert, update, delete, truncate on public.study_agent_items from authenticated;
grant select on public.study_agent_items to authenticated;
grant update (done) on public.study_agent_items to authenticated;

comment on table public.study_agent_items is
  'Разборы банка вопросов по дням для планов exam_agent (ночной агент).';
