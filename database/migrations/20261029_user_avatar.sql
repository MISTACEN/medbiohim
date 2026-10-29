-- SA3 (PRODUCT-AUDIT-PLAN-2026-10-27): аватар пользователя.
--
-- avatar_url уже существует и хранит внешний https-адрес (например, из Google).
-- Для файла, загруженного в наш Upstash Blob, нужен ключ объекта: подписанные
-- ссылки истекают, а класть временную ссылку в профиль — значит показать битую
-- картинку через час. Ключ отдаётся только через аутентифицированный прокси
-- GET /storage/avatar/:userId, поэтому приватность не зависит от bucket-политики.
--
-- Идемпотентно: миграцию можно применять повторно.

alter table public.users
  add column if not exists avatar_key text;

comment on column public.users.avatar_key is
  'Ключ объекта в Upstash Blob (users/<id>/avatars/...). Источник истины для загруженного аватара; avatar_url остаётся для внешних https-аватаров.';

-- Длина ключа ограничена так же, как MAX в воркере (safeKey ≤ 500 символов).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_avatar_key_len'
  ) then
    alter table public.users
      add constraint users_avatar_key_len check (avatar_key is null or char_length(avatar_key) <= 500);
  end if;
end $$;
