-- Result Bridge: PdfMentor возвращает результаты обработки внешнего документа.
--
-- Контракт — docs/architecture/MEDBIOHIM_PDFMENTOR_API_CONTRACT.md §5.2:
-- POST /api/v1/mentor/results (HMAC, без пользовательской сессии). PdfMentor
-- пушит найденные страницы, привязки фрагментов и маршрут обучения обратно в
-- MEDBIOHIM; повторный пуш той же версии перезаписывает прошлый результат, а не
-- копит копии.
--
-- Пишет только Worker через service-role. Политик RLS нет: клиенту таблица
-- недоступна, это серверный материал, а не пользовательский.
--
-- Файл идемпотентен.

create table if not exists public.bridge_document_results (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.files(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Версия документа заводится в PdfMentor: у MEDBIOHIM оригинала версий нет.
  version     text not null default '',
  pages       jsonb not null default '[]'::jsonb,
  fragments   jsonb not null default '[]'::jsonb,
  route       jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  constraint bridge_document_results_version_key unique (file_id, user_id, version)
);

create index if not exists bridge_document_results_user_idx
  on public.bridge_document_results (user_id, received_at desc);
create index if not exists bridge_document_results_file_idx
  on public.bridge_document_results (file_id, received_at desc);

alter table public.bridge_document_results enable row level security;

-- Политик нет: service-role обходит RLS, остальным таблица закрыта.
revoke all on public.bridge_document_results from anon, authenticated;

comment on table public.bridge_document_results is
  'Результаты обработки внешнего документа в PdfMentor: страницы, фрагменты, маршрут.';
