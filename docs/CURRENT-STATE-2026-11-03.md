# MEDBIOHIM — единое текущее состояние

**HEAD при сверке документации:** `7fbab4a7` (3 ноября 2026).

> Наличие реализации в main не означает, что она задеплоена или прошла runtime acceptance. В документе отдельно указаны факты кода и области, требующие production-проверки.

## Назначение

MEDBIOHIM — личный некоммерческий учебный проект «от студентов для студентов» для самостоятельной подготовки одной учебной группы. Это не официальный сайт университета. Домашние задания должны добавляться студентами самостоятельно; преподаватель не является обязательным участником workflow.

## Каноническая архитектура

```text
Browser / PWA
  -> Vercel Next.js frontend
  -> same-origin /api/v1/*
  -> src/app/api/v1/[...path]/route.ts
  -> Cloudflare Worker: medbiohim-api
  -> Supabase (Postgres + Auth)
  -> Upstash Redis (cache / ephemeral state)
  -> common file storage: Backblaze B2 (if configured) -> Upstash Blob fallback
```

Дополнительно:
- `medbiohim-telegram` — отдельный Cloudflare Worker бота; API-вызовы используют service binding `MEDBIOHIM_API`, если он настроен.
- `medbiohim-api-shadow` — legacy/migration fallback, не primary API.
- `integrations/cloudflare-api/` и PHP/SpaceWeb — legacy, не канонический production backend.
- Frontend production URL: `https://medbiohim.vercel.app/`.
- API success: `{ok:true,data,requestId}`; error: `{ok:false,error:{code,message},requestId}`.
- Текущий API Worker может передавать shadow ответы 501; это fallback, а не переключение primary backend.

## Хранилища — два разных пути

**Общие файлы:** `workers/api/src/lib/b2.ts` выбирает B2, если настроены B2 secrets, иначе Upstash Blob, иначе null. Общие storage/files routes используют этот adapter.

**Изображения trainer/гистологии:** `workers/api/src/routes/trainers.ts` использует отдельный resolver: индекс публичного Google Drive для карточек histology/mbh → публичный Upstash Blob → Upstash SDK. Этот endpoint не использует B2 adapter. Google Drive — временный источник. Успешная загрузка обычного файла в B2 не доказывает доступность 206 изображений атласа.

## Подтверждено кодом в main

- `workers/api/wrangler.toml` задаёт Worker `medbiohim-api`.
- Next.js proxy направляет `/api/v1/*` на основной Worker.
- `workers/api/src/index.ts` содержит shadow fallback для 501.
- `workers/api/src/routes/telegram-ingest.ts` принимает обновления из групп, классифицирует их и создаёт `homeworks`; уровни «База / Основной / Углубление» — `workers/api/src/lib/telegram-classify.ts`.
- `integrations/telegram-bot-cloudflare/` релеит групповые сообщения через service binding `MEDBIOHIM_API`; бот задеплоен как `medbiohim-telegram` и отвечает `configured:true, ingest:true`.
- `workers/api/src/lib/b2.ts` реализует B2 → Upstash для общих файлов.
- `workers/api/src/routes/trainers.ts` реализует отдельный Drive/Upstash resolver для trainer images.
- `workers/api/src/lib/telegram-initdata.ts` сортирует поля по ключу при формировании data-check-string.
- Тестовый центр представлен `src/components/tests/TestsHub.tsx` и `src/app/practice/page.tsx`; TestsHub используется страницей предмета.
- В проверенной странице предмета компонент `PhysiologyColloquium` не обнаружен.
- SQL console/RPC появились в `workers/api/src/routes/admin-database.ts` и `database/migrations/20261102_admin_exec_sql.sql`; их наличие не заменяет security review и проверку факта применения миграции.

## Сделано 2026-11-03

- Приём ДЗ из Telegram-групп: классификация → предмет (текст + название чата) → срок → 
  уровни «База / Основной / Углубление» → `homeworks` (`telegram-classify.ts`, `telegram-homework.ts`).
- Тренажёр бота: `/drill`, `/challenge`, `/formula`, `/daily`; API — `telegram-trainer.ts`, 
  миграция `20261103120000_telegram_trainer.sql` **не применена**.
- Исправлен `redirect: "error"` в fetch API-воркера (`ffd2f5e6`): health связки API→бот.
- Аудит документации: 9 битых ссылок, устаревший Telegram-relay, `DOCS-AUDIT-2026-11-03.md`.
- Проверки: worker `tsc` — 0, `npm test` — 330/330; Vercel собрал `7fbab4a7`.

## Не считать подтверждённым без новой проверки

| Область | Статус |
|---|---|
| Полный parity всех SpaceWeb API routes | Не доказан; нужен маршрутный и authenticated smoke |
| Все student/admin сценарии | Не считать принятыми без runtime проверки |
| Доступность всех 206 изображений гистологии | Нужен массовый HTTP smoke |
| Перенос trainer images на B2 | Не реализован в текущем resolver |
| Live Supabase migration ledger | Снимки 148 и 149 относятся к разным датам; нужна новая сверка |
| Production frontend = последний main | Проверено 2026-11-03: `X-Medbiohim-Build` = `7fbab4a7…` |
| Полный CI для последнего main | Не подтверждён одним Vercel status |
| Безопасность SQL console | Нужен отдельный review прав, audit trail и destructive-query safeguards |

## PR, требующие осторожности

- **#26 физиология:** сильно отстаёт от main и заменяет часть страницы предмета. Не сливать целиком; портировать недостающие функции в актуальную страницу, сохраняя вкладки.
- **#20 homework alias:** касается старого `integrations/cloudflare-api`; сначала сверить с `workers/api`, не переносить старый backend целиком.
- **#27 тестовый центр:** закрыт; актуальные элементы тестового центра уже присутствуют в main. Не считать PR доказательством текущего статуса.
Перед решениями повторно проверять актуальное состояние PR.

## Приоритеты

**P0 — production:** сверить deployed frontend commit; проверить API health и authenticated student/admin сценарии; Telegram webhook, Mini App и service binding.

Первым делом: применить миграцию тренажёра и проверить `/api/v1/telegram/ingest/health` → `reachable:true` 
после деплоя `ffd2f5e6`. Остальное — `TELEGRAM-BOT-GAP-AUDIT-2026-11-03.md` и 
`PYRAMID-AND-CHEMISTRY-ROADMAP.md`.

**P1 — данные и медиа:** сверить live Supabase ledger с SQL и объектами схемы (без destructive reset); проверить все 178 preparation + 28 electronogram изображений с HTTP status/MIME/размером/resolver; определить постоянное хранилище атласа.

**P1 — учебные сценарии:** проверить физиологию, гистологию, эмбриологию, физическую/органическую химию; портировать полезную часть PR #26 без потери текущей страницы.

**P2 — обслуживание:** получить CI runs последнего main; провести security review SQL console; инвентаризировать legacy routes/branches/PR до удаления.

## Правила статусов

- **В коде** — реализация найдена в main.
- **Задеплоено** — подтверждён deployment конкретного commit/Worker.
- **Проверено на production** — есть датированный воспроизводимый runtime результат.
- **Не проверено** — свежего доказательства нет.
- **Историческое** — верно на указанную дату, не является текущей гарантией.
- **Заменено** — новое решение supersedes старое; исторический документ сохраняется.

Не использовать проценты готовности без явных критериев и доказательств по каждому критерию.
