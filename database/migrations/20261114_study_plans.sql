-- Фаза 1 дорожной карты (docs/AI-STUDY-ROADMAP.md §2.1): сохранённый план
-- подготовки к аттестационному событию (коллоквиум / КР / зачёт / экзамен).
--
-- План детерминированный: воркер раскладывает темы плана предмета по дням,
-- «почему» у шага — правило, не LLM. Дни и отметки хранятся одним jsonb, потому
-- что план читается целиком и редко меняется (одна запись на событие).
--
-- Применение: файл НЕ применён к базе. Применить отдельным разрешённым
-- действием (supabase db push / apply_migration), затем сверить с live ledger.

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  schedule_entry_id uuid references public.schedule_entries(id) on delete cascade,
  subject_slug text,
  event_kind text not null default 'colloquium',
  event_date date not null,
  -- [{date, label, items: [{kind, title, href, why, done}]}]
  days jsonb not null default '[]'::jsonb,
  -- [{topic_id, title, mastery_pct}]
  topics jsonb not null default '[]'::jsonb,
  mastery_pct integer not null default 0,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  generated_by text not null default 'rules' check (generated_by in ('rules','ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Один активный план на событие у пользователя (идемпотентная перегенерация).
create unique index if not exists study_plans_owner_event_idx
  on public.study_plans(user_id, schedule_entry_id)
  where schedule_entry_id is not null;

create index if not exists study_plans_owner_date_idx
  on public.study_plans(user_id, event_date);

alter table public.study_plans enable row level security;

drop policy if exists study_plans_owner_select on public.study_plans;
drop policy if exists study_plans_owner_insert on public.study_plans;
drop policy if exists study_plans_owner_update on public.study_plans;
drop policy if exists study_plans_owner_delete on public.study_plans;

create policy study_plans_owner_select on public.study_plans
  for select to authenticated
  using (user_id = auth.uid());

create policy study_plans_owner_insert on public.study_plans
  for insert to authenticated
  with check (user_id = auth.uid());

create policy study_plans_owner_update on public.study_plans
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy study_plans_owner_delete on public.study_plans
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.study_plans to authenticated;
revoke all on public.study_plans from anon;

comment on table public.study_plans is
  'План ИИ-подготовки к событию расписания: дни с шагами и готовность в процентах.';
