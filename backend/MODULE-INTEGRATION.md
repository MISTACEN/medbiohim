# MEDBIOHIM — интеграция новых модулей и функций

Этот файл является канонической памяткой для добавления новых учебных модулей и backend-функций.

## 1. Главный принцип

Новый модуль должен встраиваться в уже работающий backend-контур, а не создавать отдельный способ работы с данными.

Базовая цепочка:

```
Browser
  ↓
Vercel /api/v1
  ↓
SpaceWeb PHP
  ↓
RequireAuth / RequireRole
  ↓
Repository / Service
  ↓
Supabase PostgreSQL
  ↓
REST fallback при необходимости
```

Для пользовательских данных **Supabase является единственным источником истины**. Старые JSON-файлы из `backend/data/` не используются как production source of truth.

## 2. Эталонный работающий модуль

### Расписание

Расписание считается эталонной реализацией интеграции.

API:

- `GET /api/v1/schedule`
- `GET /api/v1/admin/schedule`
- `PUT /api/v1/admin/schedule`

Рабочая схема:

1. `RequireAuth`
2. `ScheduleRepository`
3. при необходимости `ScheduleRestStore`
4. Supabase `public.schedules` + `public.schedule_entries`
5. `Response::success(...)`

Важно: расписание не переводить обратно на JSON и не дублировать его отдельным источником.

## 3. Второй эталон: тренажёр

Тренажёр по гистологии теперь использует тот же рабочий route-stack, что и расписание.

Основные endpoints:

- `GET /api/v1/trainers/feed`
- `GET /api/v1/trainers/feed/{id}`
- `POST /api/v1/trainers/feed/answer`
- `GET /api/v1/trainers/feed/{id}/image`

Текущая схема:

```
RequireAuth
  ↓
SpecialtyAccess (для МБХ)
  ↓
PostgreSQL
  ↓
Supabase REST fallback
  ↓
Response
```

Данные:

- `public.trainer_feed_cards`
- `public.trainer_feed_answers`
- `public.files` / B2 для медиа

Таким образом, расписание и тренажёр являются двумя примерами одного и того же принципа интеграции.

## 4. Как добавлять новый модуль

Для нового модуля сначала определить:

1. какие данные принадлежат модулю;
2. какие таблицы Supabase являются source of truth;
3. какие endpoint'ы нужны;
4. какая авторизация нужна;
5. нужен ли `RequireRole` или `SpecialtyAccess`;
6. нужна ли работа с файлами/B2;
7. нужен ли REST fallback.

### Рекомендуемый слой

```
routes/*.php
    ↓
Repository / Service
    ↓
Supabase / PostgreSQL
```

Route должен быть тонким: проверка доступа, чтение параметров, вызов сервиса/репозитория, формирование Response.

SQL, сложную бизнес-логику, вычисления и обработку файлов не переносить в большой route-handler, если это можно вынести в отдельный Service/Repository.

## 5. Где регистрировать endpoint

Маршруты загружаются через:

`backend/config/routes.php`

Если функция относится к существующему домену — использовать существующий route-файл этого домена.

Если создаётся новый самостоятельный домен — создать отдельный файл в `backend/config/routes/` и добавить его в массив `backend/config/routes.php`.

Не регистрировать один и тот же endpoint одновременно в нескольких route-файлах.

Для новых функций, которые повторяют proven pattern расписания/тренажёра, допустимо использовать `platform.php` как рабочую интеграционную площадку.

## 6. Авторизация

Публичная функция:

```php
Response::success(...);
```

Авторизованная:

```php
if (!RequireAuth::handle($req)) return;
```

Админская/редакторская:

```php
if (!RequireAuth::handle($req)
    || !RequireRole::handle($req, ['moderator', 'admin'])) return;
```

Для предметной/специальностной изоляции использовать существующий механизм `SpecialtyAccess`.

Нельзя считать наличие `Authorization` достаточным: backend должен проверять реальный Supabase access token через `SupabaseAuth`.

## 7. Работа с Supabase

Предпочтительный порядок:

1. PostgreSQL через существующий Repository/Service, если для домена он уже есть.
2. Supabase REST fallback, если он предусмотрен архитектурой модуля.
3. Не создавать локальный JSON fallback для production-данных.

Для server-side Supabase keys используется `SupabaseKeyHeaders`.

Legacy `service_role` JWT и modern `sb_secret_...` должны обрабатываться корректно. Современный secret key нельзя бездумно отправлять как JWT Bearer.

## 8. Работа с файлами и изображениями

Метаданные файла хранятся в Supabase `public.files`.

Сам объект хранится в B2.

Для приватного файла backend:

1. проверяет пользователя;
2. находит `object_key`;
3. получает presigned B2 URL;
4. возвращает его или делает redirect.

Для защищённых изображений нельзя рассчитывать на:

```html
<img src="/api/v1/.../image">
```

если endpoint требует Bearer token: браузерный `<img>` не добавляет наш Authorization автоматически.

Правильный frontend-подход — получить изображение через авторизованный `fetch`, создать `blob` и использовать `URL.createObjectURL()`.

## 9. Frontend-интеграция

Для API использовать:

- `src/lib/api.ts` — общий API client, token, refresh;
- `src/lib/content-api.ts` — content/trainer API helpers.

Не дублировать вручную:

```ts
fetch('/api/v1/...')
```

в каждой странице.

Для нового модуля:

```
src/lib/api.ts
      ↓
domain-specific helper
      ↓
page/component
```

Если endpoint возвращает защищённый бинарный ресурс — использовать отдельный authenticated helper по аналогии с `getTrainerImageUrl()`.

## 10. Fallback и ошибки

Ожидаемая схема:

```
DB работает → отдаём DB

DB пустая/недоступна
        ↓
Supabase REST fallback
        ↓
успех → отдаём данные
ошибка → понятный API error
```

Не делать fallback на старые JSON-файлы, если данные уже мигрированы в Supabase.

HTTP-коды:

- `401` — нет или недействителен access token;
- `403` — пользователь авторизован, но доступа нет;
- `404` — объект/маршрут реально отсутствует;
- `422` — неверные входные данные;
- `503` — backend/DB/upstream временно недоступен.

## 11. Что нельзя ломать при добавлении нового модуля

Не менять без необходимости:

- рабочее расписание;
- структуру его данных;
- Supabase как source of truth;
- текущий Vercel API proxy;
- SpaceWeb document root `backend/public`;
- текущую HTTP-схему SpaceWeb, если она используется в тестовом окружении.

Новый модуль должен добавляться рядом с работающим функционалом, а не переписывать его.

## 12. Минимальный чек-лист перед merge/deploy

```
[ ] endpoint зарегистрирован ровно один раз
[ ] RequireAuth / RequireRole добавлен
[ ] source of truth определён в Supabase
[ ] Repository/Service используется там, где это уместно
[ ] JSON не является production fallback
[ ] B2 используется только для объектов/медиа
[ ] protected media загружается с Authorization
[ ] frontend использует общий api client
[ ] 401/403/404/422/503 имеют понятную семантику
[ ] health остаётся рабочим
[ ] schedule не изменён случайно
```

## 13. Практическое правило для будущих модулей

Сначала копировать **архитектурный паттерн рабочего модуля**, а не его код буквально.

То есть:

```
Сначала:
  "Как это сделано в schedule?"

Потом:
  "Какая часть этого pattern нужна trainer/новому модулю?"

И только после этого:
  route → service/repository → Supabase → frontend helper
```

Цель — чтобы каждый следующий модуль выглядел как часть одной системы, а не как отдельный мини-проект.

Последнее обновление: 2026-09-24.


## 14. Vercel -> SpaceWeb compatibility proxy

The frontend uses the same-origin `/api/v1/*` route in Vercel. The proxy forwards the `Authorization` header unchanged to SpaceWeb. For GET requests, when the primary SpaceWeb target returns `404`, the proxy may retry the compatibility target under `public/api/v1` when the configured origin supports that layout. This fallback is transport-only: it does not change application data, authentication, or the Supabase source of truth.

This is intentionally limited to GET 404s so POST/PUT/PATCH/DELETE requests are never replayed automatically.

## 15. Trainer integration status (2026-09-24)

- Supabase `public.trainer_feed_cards` is populated and is the content source of truth.
- Frontend trainer page consumes the shared API client (`src/lib/api.ts` + `src/lib/content-api.ts`).
- `TrainerCard.preparation.imageUrl` is explicitly typed.
- Protected images must use `getTrainerImageUrl()` / authenticated `fetch` + `URL.createObjectURL()`.
- Do not deploy an older commit solely because it contains one fix if `main` already contains that fix plus subsequent synchronization changes; compare `490b040` with `main` first.

## 16. Trainer 404 compatibility fallback (2026-09-24)

Если production SpaceWeb временно не содержит trainer routes, Vercel `/api/v1/[...path]` имеет узкий fallback только для `trainers/feed`:

1. принимает тот же Bearer token;
2. читает опубликованные карточки из Supabase `public.trainer_feed_cards` через PostgREST + пользовательский JWT;
3. сохраняет ответы в `public.trainer_feed_answers` через RLS;
4. для `/trainers/feed/{id}/image` берёт `preparation.imageUrl` из карточки и проксирует оригинальный media path через SpaceWeb.

Это compatibility layer, а не новый источник данных. Рабочий backend и расписание не изменяются. Когда SpaceWeb снова отдаёт trainer endpoints, fallback можно удалить после проверки production.

### Почему это безопаснее полного переписывания

- не меняет `schedule`, auth или существующие backend routes;
- не требует service-role ключа в браузере;
- Supabase RLS продолжает проверять пользовательский JWT;
- fallback ограничен доменом `trainers/feed`.

### Проверка после deploy

- GET /api/v1/trainers/feed?subject=histology&specialty=mbh&limit=500&offset=0 -> 200
- GET /api/v1/trainers/feed/{id} -> 200
- GET /api/v1/trainers/feed/{id}/image -> 200 image/*
- POST /api/v1/trainers/feed/answer -> 201
- GET /api/v1/schedule -> не изменён
