# Cloudflare Workers — актуальная топология

**Срез:** 3 ноября 2026 года. Источник: [CURRENT-STATE-2026-11-03.md](CURRENT-STATE-2026-11-03.md).

| Worker | Назначение | Статус |
|---|---|---|
| `medbiohim-api` | Основной Hono API из `workers/api/` | Canonical production target в коде |
| `medbiohim-api-shadow` | Совместимость / migration fallback | Не primary |
| `medbiohim-telegram` | Telegram bot, Mini App, интеграционные вызовы | Отдельный Worker |

## Поток API

```text
Next.js -> /api/v1/* -> src/app/api/v1/[...path]/route.ts
       -> medbiohim-api -> Supabase / Redis / storage
```

В `workers/api/src/index.ts` предусмотрен fallback к shadow при ответе 501. Это механизм совместимости, а не указание направлять обычный production traffic на shadow.

Telegram Worker использует service binding `MEDBIOHIM_API`, когда binding доступен; публичный fetch fallback нужен для local/dev. Проверять binding и webhook отдельно.

Legacy: `integrations/cloudflare-api/` и PHP/SpaceWeb не являются каноническим backend.

## Перед изменением топологии

1. Проверить `workers/api/wrangler.toml` и deployment workflow.
2. Проверить deployed Worker/version и health.
3. Проверить Vercel proxy destination.
4. Выполнить unauthenticated и authenticated smoke.
5. Проверить Telegram service binding.
6. Только после этого менять fallback или удалять legacy.

Старые схемы в предыдущих редакциях этого документа считаются историческими.
