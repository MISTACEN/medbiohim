# RFC: cookie-авторизация вместо localStorage-токенов (E1)

Статус: черновик для ревью · основание: TECH-AUDIT-PLAN-2026-10-27 §6 E1–E3 · 2026-10-30

## 1. Зачем

Сейчас access/refresh токены лежат в `localStorage` (`mb_access_token`, `mb_refresh_token`)
и прикрепляются клиентом заголовком `Authorization: Bearer …`. Это означает:

- **XSS = полный захват аккаунта**: любой внедрённый скрипт читает оба токена;
  CSP не даёт гарантий при компрометации зависимостей.
- Токены видны в расширениях браузера и на общих машинах.
- Refresh-токен живёт в localStorage бессрочно — «выйти» чистит, но не защищает.

Цель E2/E3: токены в `HttpOnly; Secure; SameSite=Lax` cookie — JavaScript их
не видит, XSS теряет доступ к сессии.

## 2. Кто в цепочке

```
Браузер ──(same-origin)──► Vercel (Next.js)
                            ├─ /api/v1/* → прокси src/app/api/v1/[...path]/route.ts
                            │              └─► Cloudflare Worker medbiohim-api
                            └─ /auth/*     → Supabase Auth (Google OAuth, magic link)
```

- Прокси уже серверный (`runtime nodejs`, `force-dynamic`) и уже валидирует
  токен через Supabase (`isCanonicalAdminRequest`) — естественное место для
  установки/обновления cookie.
- Worker остаётся «тупым» получателем Bearer — менять все 60+ роутов не нужно.
- Supabase Auth (Google/magic link) возвращает токены в hash/query callback —
  их перехватывает `AuthHashCatcher` / `/auth/callback`; там же можно
  обменять их на cookie **без сохранения в localStorage**.

## 3. Предлагаемый дизайн

### 3.1 Cookie

| Cookie | Содержимое | Атрибуты | TTL |
|---|---|---|---|
| `mb_at` | access token (JWT, ~1 ч) | `HttpOnly; Secure; SameSite=Lax; Path=/` | жизнь access |
| `mb_rt` | refresh token | `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` | жизнь сессии Supabase |

- `SameSite=Lax` (не Strict): навигация с внешних ссылок должна видеть сессию;
  POST-запросы с чужих origin и так не пройдут CSRF-проверку (§4).
- `Path=/api/auth` у refresh: рефреш выполняется одним эндпоинтом,.refresh-кука
  не отправляется на каждый API-вызов.
- Домен не указывать (host-only) — кука не уедет на сторонние поддомены.

### 3.2 Новые эндпоинты на Vercel (Next.js route handlers)

```
POST /api/auth/session   { access_token, refresh_token }  → ставит mb_at + mb_rt,
                                                            возвращает 204
POST /api/auth/refresh    (читает mb_rt)                  → обновляет обе куки
POST /api/auth/logout     (читает mb_rt)                  → Supabase revoke + очистка
```

- Прокси `/api/v1/*` перестаёт читать `Authorization` как единственный источник:
  порядок — `Authorization` (для обратной совместимости) → cookie `mb_at`.
- `mb_at` протух → прокси сам пробует `/api/auth/refresh` (сервер-сайд,
  single-flight в рамках одного запроса), при неудаче отдаёт 401 как сейчас.

### 3.3 Клиент (`AuthProvider`, `api()`)

- `request()` перестаёт читать localStorage и подставлять `Authorization`;
  все вызовы идут с `credentials: "same-origin"` (fetch same-origin и так
  шлёт куки — явный флаг для читаемости).
- Логин (пароль/Google/magic link) → токены сразу в `POST /api/auth/session`,
  в localStorage не попадают.
- Выход → `POST /api/auth/logout` (сервер ревокает refresh у Supabase), затем
  очистка локального состояния.
- Очистка legacy-ключей localStorage при первом заходе новой версии.

### 3.4 Что остаётся на Bearer

- Расширение браузера: оно ходит напрямую на Worker (не same-origin с сайтом),
  cookie third-party не работает — расширение сохраняет свой Bearer из своего
  login-потока (его токены живут в `chrome.storage`, не в localStorage сайта).
- Скачивание изображений тренажёра через `<img>`: сейчас Bearer в fetch +
  blob. С куками становится проще — `<img src="/api/v1/trainers/feed/:id/image">`
  работает сам (same-origin cookie).

## 4. CSRF

`SameSite=Lax` закрывает классический CSRF для POST/PATCH/DELETE с чужих
сайтов (кросс-сайтовые POST не несут cookie). Остаточные риски и защита:

1. **GET с побочными эффектами** — таких роутов в API нет (аудит §4.9 уже
   закрепил: мутации только POST/PATCH/DELETE). Проверить контрактным тестом.
2. **Same-site subdomain** — не применимо: API только на своём origin.
3. Дополнительно (defense-in-depth): проверка `Origin`/`Sec-Fetch-Site` в
   прокси для мутаций — если origin не совпадает с `CLOUDFLARE_API_ORIGIN`
   и сайтом, 403. Дёшево, без токенов.

## 5. Миграция (поезд без остановки)

1. **Этап 0 (этот документ)** — ревью дизайна.
2. **Этап 1**: серверные эндпоинты session/refresh/logout + dual-read в
   прокси (Bearer ИЛИ cookie). Клиент ещё на localStorage — ничего не ломается.
3. **Этап 2**: клиент пишет в `/api/auth/session` и перестаёт читать
   localStorage; legacy-ключи чистятся при загрузке. Единый флаг
   `mb_auth_transport=cookie` в localStorage — чтобы старые вкладки не
   смешивали режимы.
4. **Этап 3**: dual-read убирается, `Authorization` остаётся только для
   расширения и тестов. Контрактные тесты: «нет токенов в localStorage»
   (E3 DoD), «cookie HttpOnly» (проверка заголовков Set-Cookie).

**Откат**: вернуть клиентский коммит этапа 2 (один revert) — куки безвредно
останутся, клиент снова читает localStorage.

## 6. Риски и открытые вопросы

- **Vercel/serverless и Set-Cookie**: route handlers корректно отдают
  Set-Cookie; убедиться, что прокси не кэширует ответы с куками
  (`Cache-Control: no-store` на session-эндпоинтах).
- **Несколько вкладок**: refresh из одной вкладки инвалидирует access другой
  на долю секунды до её следующего 401→refresh — приемлемо; при необходимости
  BroadcastChannel.
- **Мобильный PWA**: SW кэширует статику, не API — ок; офлайн-оболочка FA10
  не трогает авторизацию.
- **Supabase refresh rotation**: при ротации refresh-токена нужно атомарно
  обновлять `mb_rt`; параллельные refresh-и с одним токеном дадут 401 —
  single-flight на сервере обязателен.
- **Время жизни access 1 ч** — серверный refresh в прокси делает продление
  незаметным; текущий клиентский single-flight (D8) остаётся fallback'ом.

## 7. DoD для E2/E3 (напоминание из плана)

- Логин/refresh/logout работают на cookies; localStorage не содержит токенов
  (тест); поведение и UX без изменений; откат — один revert.
