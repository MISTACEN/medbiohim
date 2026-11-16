-- 2026-11-17 · Фото в карточках-паках (Quizlet-стиль): к пункту пака можно
-- прикрепить изображение (файл из files, загруженный через POST /files/upload
-- с visibility=public). Хранится ссылкой на файл — не дубликат бинарника.
-- Публикация пака остаётся читаемой: image_file_id ссылается на публичный файл,
-- поэтому чужой импортированный пак показывает те же картинки.

alter table public.card_pack_items
  add column if not exists image_file_id uuid references public.files(id) on delete set null;

create index if not exists card_pack_items_image_idx
  on public.card_pack_items(image_file_id) where image_file_id is not null;
