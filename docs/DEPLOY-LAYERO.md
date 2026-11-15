# Резервный контур Layero

Layero ([layero.ru](https://layero.ru)) — российский хостинг Next.js (SSR,
RU-серверы, Free-тариф `*.layero.app`). В архитектуре MEDBIOHIM — резервный
контур на случай недоступности Cloudflare (API) и/или Vercel (сайт).
Основной путь остаётся: Vercel → `/api/v1` прокси → Cloudflare Worker `medbiohim-api`.

## C1. Прокси GigaChat на Layero

Прямой вызов GigaChat идёт с воркера Cloudflare к `sberbank` (OAuth на
`ngw.devices.sberbank.ru:9443`, чат на `gigachat.devices.sberbank.ru`). Если
Cloudflare не может достучаться до Сбера (сеть, сертификаты), воркер повторяет
тот же вызов через прокси на Layero.

**Подключение (воркер):**

- env `GIGACHAT_FALLBACK_BASE_URL` — базовый URL прокси, например
  `https://medbiohim-gigachat.layero.app/gigachat`. Задаётся в wrangler
  (`wrangler secret put GIGACHAT_FALLBACK_BASE_URL` или `wrangler.jsonc` vars).
- Кандидат gigachat в `getAiCompletionCandidates` получает `fallback_base`;
  `callGigaChatCompletion` делает один повтор по `AI_UPSTREAM_UNAVAILABLE`
  (429 и ошибки настроек не ретраятся).

**Контракт прокси (что должен реализовать route handler на Layero):**

| Эндпоинт | Назначение | Запрос |
|---|---|---|
| `POST {BASE}/oauth` | OAuth GigaChat: прокси пересылает в `ngw.devices.sberbank.ru:9443/api/v2/oauth` | те же заголовки (Basic, RqUID) и form-тело `scope=…`; ответ — `{access_token}` |
| `POST {BASE}/chat/completions` | чат: пересылает в `gigachat.devices.sberbank.ru/api/v1/chat/completions` | `Authorization: Bearer <access_token>` + JSON тела; ответ — как у GigaChat |

Прокси не хранит ключи — Basic-заголовок приходит от воркера, который и так
владеет `GIGACHAT_CREDENTIALS`. Без `GIGACHAT_FALLBACK_BASE_URL` резервный путь
просто не активируется (поведение и тайминги основного канала не меняются).

## C2. Зеркало сайта на Layero

1. Аккаунт Layero → создать приложение из этого же Git-репозитория
   (`npx layero@latest deploy` или привязка репозитория в кабинете).
2. Env приложения: те же публичные переменные, что у Vercel-проекта
   (`NEXT_PUBLIC_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`); **без** секретов
   воркера (они не нужны фронту).
3. Next.js SSR на Layero работает с тем же Supabase — он доступен из RU.
4. Лимиты Free: serverless-функции, нет cron и ботов — Telegram-воркер и
   расписание остаются на Cloudflare.
5. Полученный домен (`*.layero.app`) — в `NEXT_PUBLIC_FALLBACK_MIRROR_URL`
   Vercel-проекта: баннер резервного канала будет вести на него.
6. Обновление зеркала: пере-деплой при значимых релизах (можно вручную);
   зеркало необязательно держать синхронным до минуты.

## C3. Баннер резервного канала

`src/components/layout/FallbackBanner.tsx` (в AppShell): 3 сетевых сбоя подряд
по `/api/v1` (счётчик в `src/lib/api/client.ts`, события
`mbh:api-channel-down` / `mbh:api-channel-up`) → липкий баннер со ссылкой на
зеркало. Отмена и таймаут запроса не считаются «нет связи». Успешный ответ
любого статуса поднимает баннер. Без `NEXT_PUBLIC_FALLBACK_MIRROR_URL` баннер
не показывается вовсе.

## Чек-лист внедрения (когда появится аккаунт Layero)

1. [ ] Приложение Layero из репозитория, env из п. 2.
2. [ ] Route handler прокси GigaChat (`/gigachat/oauth`, `/gigachat/chat/completions`).
3. [ ] Проверка прокси: curl oauth + чат с тестовыми кредами.
4. [ ] `GIGACHAT_FALLBACK_BASE_URL` в wrangler vars воркера → `npm run deploy`.
5. [ ] `NEXT_PUBLIC_FALLBACK_MIRROR_URL` в Vercel → редеплой фронта.
6. [ ] Живой тест C3: выключить сеть/заблокировать воркер → баннер, восстановление → исчезает.
