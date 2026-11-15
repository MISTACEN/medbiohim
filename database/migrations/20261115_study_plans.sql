-- Сохраняемые планы подготовки к событию (коллоквиум/КР/экзамен):
-- дни с шагами-действиями и отметками, темы с оценкой освоенности.
-- Отметки шагов меняются точечным jsonb_set (атомарно, безопасно для
-- нескольких открытых вкладок).

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  schedule_entry_id uuid not null references public.schedule_entries(id) on delete cascade,
  subject_slug text,
  event_date date not null,
  event_title text,
  days jsonb not null default '[]'::jsonb,
  topics jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  generated_by text not null default 'rules',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, schedule_entry_id)
);

create index if not exists study_plans_user_idx on public.study_plans(user_id, updated_at desc);

alter table public.study_plans enable row level security;

create policy study_plans_owner_all on public.study_plans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
