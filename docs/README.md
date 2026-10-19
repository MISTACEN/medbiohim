# Документация MEDBIOHIM

## Актуальные документы

| Документ | Назначение |
|----------|------------|
| **[WORKERS-TOPOLOGY.md](WORKERS-TOPOLOGY.md)** | **LOCKED:** `medbiohim-api` = единственный прод API; shadow = fallback only |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Архитектура (Vercel + SpaceWeb + Supabase + Cloudflare) |
| [SPACEWEB-API-INVENTORY.md](SPACEWEB-API-INVENTORY.md) | **Полный инвентарь PHP API** — сверка с Cloudflare |
| [STATUS.md](STATUS.md) | Исторический снимок от 2026-10-15; проверять дату перед использованием |
| [API-ROUTE-PARITY-AUDIT-2026-10-19.md](API-ROUTE-PARITY-AUDIT-2026-10-19.md) | Текущая статическая матрица API-маршрутов |
| [LIVE-SUPABASE-AUDIT-2026-10-19.md](LIVE-SUPABASE-AUDIT-2026-10-19.md) | Live-миграции, RLS и Security/Performance Advisor |
| [PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md](PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md) | Production API smoke и 206 карточек гистологии |
| [MIGRATION-LEDGER-RECONCILIATION-2026-10-19.md](MIGRATION-LEDGER-RECONCILIATION-2026-10-19.md) | Сверка 148 migration ledger записей с SQL файлами |
| [MIGRATION-LEDGER-MAP-2026-10-19.csv](MIGRATION-LEDGER-MAP-2026-10-19.csv) | Все 148 записей ledger и кандидаты исходных файлов |
| [SQL-SOURCE-INVENTORY-2026-10-19.csv](SQL-SOURCE-INVENTORY-2026-10-19.csv) | Инвентарь 139 SQL-файлов и их связь с ledger |
| [REPOSITORY-CLEANUP-DECISIONS-2026-10-19.md](REPOSITORY-CLEANUP-DECISIONS-2026-10-19.md) | KEEP / ARCHIVE / REMOVE с доказательствами |
| [WORKFLOW-CLEANUP-AUDIT-2026-10-19.md](WORKFLOW-CLEANUP-AUDIT-2026-10-19.md) | Риски ручных GitHub Actions |
| [REPOSITORY-CLEANUP-AUDIT-2026-10-19.md](REPOSITORY-CLEANUP-AUDIT-2026-10-19.md) | Общий аудит файлов и инфраструктуры |
| [../BRANCHES.md](../BRANCHES.md) | Правила веток main / spaceweb-backend / beta |
| [ACTIVE-EXPERIMENTS.md](ACTIVE-EXPERIMENTS.md) | Что крутится на beta |
| [platform-concept-medbiohim.md](platform-concept-medbiohim.md) | Учебная концепция (предмет → разделы) |
| [../backend/MODULE-INTEGRATION.md](../backend/MODULE-INTEGRATION.md) | Паттерн добавления модулей в PHP |
| [chemical-engine.md](chemical-engine.md) | Chemical engine (PubChem и т.д.) |
| [dev-notes.md](dev-notes.md) | Технические правила разработки |

## Workers (кратко)

```
medbiohim-api          = единственный прод API   (workers/api/)
medbiohim-api-shadow   = fallback MEDBIOHIM_UPSTREAM only
medbiohim-telegram     = бот, не API сайта
```

Подробно: [WORKERS-TOPOLOGY.md](WORKERS-TOPOLOGY.md).

## Интеграции

- [../integrations/browser-extension/README.md](../integrations/browser-extension/README.md)
- [../integrations/telegram-bot/README.md](../integrations/telegram-bot/README.md)
- [../workers/api/](../workers/api/) — **production** Worker API (`medbiohim-api`)
- [../integrations/cloudflare-api/](../integrations/cloudflare-api/) — **shadow only** (`medbiohim-api-shadow`)
- [../integrations/telegram-bot-cloudflare/](../integrations/telegram-bot-cloudflare/) — Telegram Worker

## История / аудиты

Старые pass-отчёты (`*-PASSXX-*.md`, `CONTINUATION-HANDOFF-*`, длинные CI/security notes)
оставлены в `docs/` временно. Их можно перемещать в `docs/history/` без потери истории Git.

Они **не** являются текущим планом. Актуальный статус — только в [STATUS.md](STATUS.md).

## Как пользоваться инвентарём SpaceWeb

1. Открой [SPACEWEB-API-INVENTORY.md](SPACEWEB-API-INVENTORY.md).
2. Для каждого маршрута смотри колонку **Cloudflare**.
3. Цель cutover: все student-facing маршруты = ✅, admin — по приоритету.
