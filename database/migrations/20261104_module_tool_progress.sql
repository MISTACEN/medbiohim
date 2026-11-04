-- 20261104_module_tool_progress.sql
--
-- Контракт прогресса учебных модулей и инструментов (раздел 18 задания).
--
-- Принципы:
--   * один инструмент = одна запись прогресса на пользователя; связь с
--     предметом хранится как контекст последнего запуска (launch_context),
--     а не как отдельная строка на предмет;
--   * предмет определяется стабильно: subject_id (UUID) + subject_area_key
--     (каноническая область из src/lib/learning/modules.ts), slug не источник
--     истины — дисциплины без slug и дубли slug не ломают прогресс;
--   * миграция ТОЛЬКО аддитивная: новая таблица, RLS не трогается здесь;
--     повторный запуск безопасен (IF NOT EXISTS);
--   * НЕ ПРИМЕНЯТЬ на production без согласования — лежит в ветке
--     feat/portal-integrations-learning-labs как контракт для планировщика.
--
-- Прогресс сегодня пишется в localStorage (ключи learning/* и симуляций),
-- эта таблица — серверная точка синхронизации, когда понадобится
-- кросс-устройство. Поля повторяют ToolProgressContract.

create table if not exists public.module_tool_progress (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  module_id text not null,
  tool_id text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  subject_area_key text,
  launch_context jsonb,
  completion_status text not null default 'not_started'
    check (completion_status in ('not_started', 'in_progress', 'completed')),
  progress jsonb,
  result jsonb,
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tool_id)
);

create index if not exists module_tool_progress_user_idx
  on public.module_tool_progress (user_id, updated_at desc);

create index if not exists module_tool_progress_subject_idx
  on public.module_tool_progress (subject_id)
  where subject_id is not null;
