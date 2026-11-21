-- Аудит Document Bridge: кто и на каком основании получил файл.
--
-- Пишет только Worker через service-role (RLS без политик: клиентам таблица
-- недоступна). Храним результат попытки, а не содержимое: сам файл и так лежит
-- в `files`/хранилище.
--
-- Файл идемпотентен.

create table if not exists public.bridge_document_reads (
  id         uuid primary key default gen_random_uuid(),
  file_id    uuid not null references public.files(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  outcome    text not null check (outcome in ('allowed', 'forbidden', 'not_found', 'error')),
  bytes      integer,
  created_at timestamptz not null default now()
);

create index if not exists bridge_document_reads_user_idx
  on public.bridge_document_reads (user_id, created_at desc);
create index if not exists bridge_document_reads_file_idx
  on public.bridge_document_reads (file_id, created_at desc);

alter table public.bridge_document_reads enable row level security;

-- Политик нет: service-role обходит RLS, остальным таблица закрыта.
revoke all on public.bridge_document_reads from anon, authenticated;

comment on table public.bridge_document_reads is
  'Аудит выдачи файлов в PdfMentor: результат проверки прав на каждое чтение.';
