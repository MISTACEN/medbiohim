# Аудит документации MEDBIOHIM — 2026-11-03

> Проверены все markdown-файлы репозитория: `docs/`, корень, `backend/`,
> `workers/*/`, `integrations/*/`, `browser-extension/`.

## Объём и метод

- **197** markdown-файлов; из них **125** — датированные снимки (аудиты, pass-отчёты,
  handoff). Они исторические по определению и не обязаны описывать текущий `main`.
- Проверено автоматически: относительные ссылки, внешние URL (неканонические хосты,
  `http://`, `localhost`, preview-домены), маркеры `TODO/FIXME/«не задан»`.
- Ключевые документы сверены с кодом: `docs/README.md`, `CURRENT-STATE-2026-11-03.md`,
  `WORKERS-TOPOLOGY.md`, `ARCHITECTURE.md`, README бота, документ деплоя Telegram.
- Live-проверки: `medbiohim-api` health, `medbiohim-telegram` health, Vercel
  `X-Medbiohim-Build`, `/telegram/ingest` без секрета → 401.

## Что исправлено

| Проблема | Где | Правка |
|---|---|---|
| 9 битых относительных ссылок | `MOGRATION-STATUS.md`, `docs/PHASE-1-CHECKLIST.md`, `docs/WORK-SUMMARY-2026-10-22.md`, `docs/WORK-COMPLETION-SUMMARY-2026-10-22.md` | исправлена глубина `../`, `integration-plan.md` → `INTEGRATION-PLAN.md`, отсутствующий скриншот заменён пометкой |
| «relay в PHP не задан» | `integrations/telegram-bot-cloudflare/README.md`, `docs/CLOUDFLARE-GITHUB-TELEGRAM-DEPLOYMENT.md` | описано текущее: `TELEGRAM_INGEST_URL` → `/api/v1/telegram/ingest`, классификация, предмет, срок, уровни |
| Старый HEAD в срезе | `docs/CURRENT-STATE-2026-11-03.md` | `ffd2f5e6` + подтверждённые кодом пункты про Telegram-конвейер |
| Не подтверждённое «production = main» | `docs/CURRENT-STATE-2026-11-03.md` | зафиксировано доказательство `61d1f0dc` и что для `ffd2f5e6` проверки не было |

## Проверено и совпадает с кодом

- `docs/README.md` — карта документации, ссылки на текущие источники живые.
- `docs/WORKERS-TOPOLOGY.md` — три Worker'а, service binding `MEDBIOHIM_API`
  действительно объявлен в `integrations/telegram-bot-cloudflare/wrangler.toml`.
- `docs/ARCHITECTURE.md` — цепочка `Next.js → /api/v1 → medbiohim-api → Supabase/Redis`
  соответствует `src/app/api/v1/[...path]/route.ts` и `workers/api/src/index.ts`.
- README бота: команды `/drill`, `/challenge`, `/formula`, `/daily` реально
  зарегистрированы в `BOT_COMMANDS`; health отдаёт `configured:true, ingest:true`.
- Root `README.md`: все пять ссылок на документы существуют; PHP назван legacy,
  что соответствует топологии.

## Что осталось (не ошибки, а решения)

1. **Исторические снимки не отделены от текущих.** 125 датированных файлов лежат
   рядом с актуальными. Предложение: перенести всё старше 2026-10-20 в
   `docs/archive/` и оставить в `docs/` только текущие источники и реестр.
2. **Локальные `http://localhost:3000` в гайдах** (`QUICK_TEST_GUIDE.md`,
   `GOOGLE-AUTH-SETUP.md`) — это примеры для разработки, не production-адреса;
   помечать их как dev-only полезно, но менять не обязательно.
3. **`PHASES_STATUS.md` ссылается на shadow Worker** — корректно как legacy, но
   стоит явно писать «не primary».
4. **`docs/TELEGRAM-VERIFICATION-2026-10-26.md`** содержит preview-хост
   `medbiohim-git-main-…` и `192.168.x.x` — это исторический отчёт; при переносе
   в архив пометить, что адреса недействительны.
5. **`docs/UNIVERSITY-INTEGRATION-CONTRACT.md`** описывает внешние HTTP-адреса
   вуза (`http://test.fesmu.ru:8080`) — это чужая система, не наш канон.
6. **`docs/UNFINISHED-REGISTRY.md`** остаётся большим накопленным реестром с
   устаревшими приоритетами (CI-блокеры октября). Для текущих задач использовать
   `CURRENT-STATE-2026-11-03.md` и `TELEGRAM-BOT-GAP-AUDIT-2026-11-03.md`.

## Правило на будущее

Документ с датой в имени — снимок, а не гарантия. Актуальный статус живёт в
`docs/CURRENT-STATE-2026-11-03.md`; при изменении топологии или интеграции
обновлять его и `docs/WORKERS-TOPOLOGY.md` в том же коммите.
