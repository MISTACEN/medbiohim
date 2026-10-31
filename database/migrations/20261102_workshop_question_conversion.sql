-- 2026-11-02 · Блок 1 бэклога: хим-тесты из Workshop = полноценные тесты.
--
-- 1. Provenance: вопрос банка, сконвертированный из Workshop, хранит ссылку
--    на исходный элемент — как chemistry_master_item_provenance, но на самой
--    строке questions. source='manual' — вопросы, созданные админом напрямую.
-- 2. Статусы конвертации на элементе Workshop: none → ready → published,
--    отклонение — rejected с пояснением (элемент остаётся в Workshop).
-- 3. Картинки в вариантах: options[].image_file_id — uuid файла из
--    workshop_item_files исходного элемента; рендерится через
--    /workshop/items/:id/files/:fileId (файл остаётся в Workshop, хранилище
--    не дублируется). Никаких RLS-послаблений: файлы Workshop уже
--    проверяют публикацию элемента.

alter table public.questions
  add column if not exists source text not null default 'manual';
alter table public.questions
  add column if not exists source_item_id uuid references public.workshop_items(id) on delete set null;

-- Исторические вопросы в банке заведены админом/импортом, а не из Workshop.
update public.questions set source = 'manual' where source is null;

do $$ begin
  alter table public.questions add constraint questions_source_check
    check (source in ('manual', 'workshop', 'master', 'import'));
exception when duplicate_object then null; end $$;

create index if not exists questions_source_item_idx on public.questions (source_item_id);
create index if not exists questions_source_idx on public.questions (source) where source <> 'manual';

alter table public.workshop_items
  add column if not exists question_conversion_status text not null default 'none';
alter table public.workshop_items
  add column if not exists question_conversion_note text;
alter table public.workshop_items
  add column if not exists question_converted_at timestamptz;
alter table public.workshop_items
  add column if not exists question_converted_by uuid references public.users(id) on delete set null;

do $$ begin
  alter table public.workshop_items add constraint workshop_items_question_conversion_status_check
    check (question_conversion_status in ('none', 'ready', 'published', 'rejected'));
exception when duplicate_object then null; end $$;

create index if not exists workshop_items_conversion_status_idx
  on public.workshop_items (question_conversion_status, created_at desc);

comment on column public.questions.source is
  'Происхождение вопроса: manual (админ), workshop (сконвертирован из Workshop, см. source_item_id), master, import.';
comment on column public.questions.source_item_id is
  'Provenance: исходный workshop_items.id для source=workshop. Картинки вариантов — workshop_item_files.id в options[].image_file_id.';
comment on column public.workshop_items.question_conversion_status is
  'Статус конвертации в банк вопросов: none → ready → published; rejected — отклонено модератором с пояснением в question_conversion_note.';
