# MEDBIOHIM — блоки параллельной разработки

**Назначение:** разделить MEDBIOHIM на самостоятельные рабочие блоки, чтобы несколько моделей могли одновременно исследовать и реализовывать разные части сайта без перезаписи чужих изменений.

Это карта организации разработки, а не запуск моделей и не изменение архитектуры production. Блоки не являются отдельными приложениями или репозиториями: все они работают над одним MEDBIOHIM и сходятся через координатора.

## 1. Общая схема

```text
                         USER
                           |
                    COORDINATOR / LEAD
             scope • contracts • ownership • integration
                           |
       +---------+---------+---------+---------+---------+
       |         |         |         |         |         |
   FRONTEND   API/CF    DATABASE  EDUCATION  STORAGE   DEVOPS
       |         |         |         |         |         |
       +---------+---------+---------+---------+---------+
                           |
                    QA / SECURITY
                           |
                 COORDINATOR INTEGRATION
                           |
                         main
                           |
                 Vercel / Cloudflare
             только после отдельного допуска
```

**Основной принцип:** параллелим независимые блоки, а не дублируем работу. Один файл или общий ресурс в рамках одной задачи имеет ровно одного владельца.

## 2. Рабочие блоки

| ID | Блок | Основная зона | Результат |
|---|---|---|---|
| B1 | Frontend / PWA | Next.js, страницы, UI, адаптивность, PWA | Готовые пользовательские экраны и UI-поведение |
| B2 | API / Cloudflare | Hono Worker, API routes, middleware, сервисы | Реализованные и протестированные API endpoints |
| B3 | Database / Supabase | SQL migrations, schema, RLS, запросы и связи | Согласованная схема и безопасный доступ к данным |
| B4 | Education / Content | Предметы, лекции, билеты, тесты, учебные материалы | Проверенный контент и структуры импорта |
| B5 | Storage / Media | Drive index, B2/Blob adapters, Redis cache, media resolver | Надёжная загрузка и выдача файлов/изображений |
| B6 | Integrations | Telegram Worker, browser extension и внешние интеграции | Рабочие интеграционные сценарии |
| B7 | DevOps / CI | GitHub Actions, Vercel/Cloudflare конфигурация, release scripts | Повторяемые проверки и контролируемые релизы |
| B8 | QA / Security | unit/integration/e2e, RLS review, auth, regressions | Независимый отчёт PASS/FAIL и блокирующие риски |
| B0 | Coordinator | План, контракты, карта владения, интеграция | Единый проверенный результат в main |

### B1 — Frontend / PWA

- Основные каталоги: `src/app/**`, `src/components/**`, `src/hooks/**`, `src/lib/**`, `src/types/**`, `public/**`.
- В рамках одной задачи ведущий Frontend перечисляет конкретные разрешённые файлы; широкие glob-права не выдаются автоматически.
- Не меняет API proxy, общие API-типы и контракты без согласования с B2/B3.
- Не меняет серверные секреты, Worker и SQL.

### B2 — API / Cloudflare

- Основная зона: `workers/api/src/routes/**`, `workers/api/src/middleware/**`, `workers/api/src/jobs/**`, сервисы в `workers/api/src/lib/**`.
- `workers/api/src/index.ts`, `env.ts`, общие типы, response helpers и route registry — shared/high-conflict: один назначенный owner на задачу.
- Backend владеет регистрацией и интеграцией маршрутов. Другие блоки могут готовить отдельные service/helper patches только по явному назначению.
- Production Worker, bindings и secrets не меняются без отдельного разрешения.

### B3 — Database / Supabase

- Кандидатные каталоги миграций: `supabase/migrations/**`, `database/migrations/**`, `backend/database/migrations/**`.
- До изменения определить активную схему и применённые миграции по ledger; не запускать исторические каталоги целиком.
- Одна миграция/таблица/политика имеет одного владельца в рамках задачи.
- Любые изменения RLS, destructive SQL, массовые операции и применение миграций к production требуют отдельного подтверждения.

### B4 — Education / Content

- Учебные материалы, вопросы, билеты и структуры контента в назначенных файлах `src/data/**`, `public/content/**`, `docs/**` или выделенном источнике данных.
- Деление по предметам: Histology, Physiology, Organic/Physical Chemistry, Embryology, Tests/Assessment.
- Предметные исполнители получают точный subject/specialty/topic/mode и конкретный набор файлов.
- Не редактируют общий индекс, manifest, import registry или миграции одновременно с другими исполнителями.
- Не перезаписывают существующие вопросы и карточки; перед импортом — проверка уникальности и объёма.

### B5 — Storage / Media

- Зона: назначенные storage adapters/helpers, media indexes/manifests и их тесты.
- Для histology trainer media отдельно согласовать владение `workers/api/src/routes/trainers.ts` (route owner) и индексом/adapter (storage owner).
- Не менять одновременно один manifest/index с B4.
- Не удалять объекты, не ротировать токены и не менять bucket/production credentials без отдельного допуска.

### B6 — Integrations

- Telegram Cloudflare: `integrations/telegram-bot-cloudflare/**`.
- Browser extension: `browser-extension/**` и/или `integrations/browser-extension/**` — сначала установить актуальный production path.
- Legacy `integrations/cloudflare-api/**` и `integrations/telegram-bot/**` по умолчанию read-only; не возвращать их в production path без отдельной задачи.
- Изменения контрактов с API согласуются с B2.

### B7 — DevOps / CI

- Зона: `.github/workflows/**`, назначенные deploy scripts и документация релизов.
- Не редактирует root package manifests/lockfiles, Worker config или Vercel config одновременно с другими блоками.
- CI проверки можно готовить отдельно; production deploy, DNS, secrets и bindings не входят в обычную задачу.

### B8 — QA / Security

- Независим от автора feature patch.
- Проверяет пользовательские сценарии, auth/session, RLS, API contracts, media access, UI regressions и тесты.
- Может выполнять параллельные read-only проверки по разным направлениям.
- Имеет право вернуть patch на исправление и заблокировать интеграцию при утечке секрета, обходе авторизации, потере данных или критической регрессии.

## 3. Какие блоки можно запускать одновременно

| Комбинация | Допуск | Условие |
|---|---|---|
| B1 + B2 | Да | API contract и типы заранее зафиксированы; файлы не пересекаются |
| B2 + B3 | Да, ограниченно | Схема/миграция согласована заранее; route и migration разные владельцы |
| B4 предмет A + B4 предмет B | Да | Разные source files; общий индекс/manifest не редактируется параллельно |
| B4 + B5 | Да, ограниченно | Content source и media adapter/index разведены; общий manifest имеет одного owner |
| B1 + B8 | Да | QA read-only, отдельный reviewer |
| B2 + B8 | Да | QA read-only; тестовые файлы не конфликтуют с автором |
| B7 + любой блок | Да, ограниченно | Только отдельные workflow/scripts; общие config/lockfiles зарезервированы |
| Два агента в одном файле | Нет | Один owner, остальные дают review/patch suggestion |
| Две миграции одной схемы одновременно | Нет | Сначала единый DB owner и последовательный порядок |
| Несогласованные UI/API/DB изменения | Нет | Сначала фиксируется контракт и порядок интеграции |

## 4. Исполнительная карточка — обязательна перед запуском

Координатор создаёт отдельную карточку для каждого исполнителя:

```text
Task ID:
Block:
Agent/model:
Lead:
Base main SHA:
Goal / user outcome:
Acceptance criteria:
Writable files (exact paths):
Read-only dependencies:
Shared contract:
Dependencies / integration order:
Allowed commands:
Forbidden actions:
Tests/checks:
Deliverable:
Reviewer:
Reservation expiry:
Production actions: NONE unless separately approved
```

Если точные writable paths ещё неизвестны, исполнитель работает только в режиме read-only discovery. После исследования координатор фиксирует файлы и только затем разрешает изменения.

## 5. Безопасный жизненный цикл задачи

1. **Intake:** координатор изучает запрос, текущий `main`, инструкции, roadmap и релевантные тесты.
2. **Discovery:** при необходимости несколько моделей независимо исследуют разные участки без записи.
3. **Contract freeze:** согласовать API/DB/type/content interfaces, если задача пересекает блоки.
4. **Ownership reservation:** назначить точные файлы, владельцев, зависимости и base SHA.
5. **Parallel implementation:** каждый исполнитель работает в отдельном worktree/container/patch workspace. Не делить один checkout.
6. **Handoff:** каждый возвращает patch/diff, список файлов, тесты, риски и подтверждение отсутствия production действий.
7. **Independent QA:** отдельная модель проверяет diff, security и пользовательские сценарии.
8. **Sequential integration:** координатор проверяет актуальный HEAD и применяет patches по одному. При изменившемся base — пересобирает patch, не перезаписывает изменения.
9. **Verification:** lint, typecheck, unit/integration/e2e/build — по затронутому стеку.
10. **Release gate:** production deploy только после отдельного разрешения пользователя.

Если у доступной среды нет изолированных worktree/контейнеров, не имитировать безопасную параллельную запись: разрешены параллельные read-only исследования, изменения выполняются последовательно.

## 6. Приоритеты первого распределения MEDBIOHIM

Это стартовая очередь аудита, а не утверждение, что блоки уже исправлены.

| Очередь | Блоки | Задача |
|---|---|---|
| P0 | B0 + B8 | Снять актуальный снимок main, проверить инструкции, статусы CI и определить блокирующие риски |
| P1 | B2 + B3 | Сверить Cloudflare API routes с контрактами и реальной Supabase schema/RLS |
| P1 | B1 | Проверить основные пользовательские сценарии и соответствие UI реальным API |
| P1 | B5 + B4 | Проверить цепочку media/content: source → index → storage → API → UI; отдельно инвентаризировать предметные данные |
| P2 | B6 | Проверить Telegram и browser extension интеграции |
| P2 | B7 + B8 | Укрепить CI, regression/e2e и security gates |

Координатор может изменить очередь после актуального аудита. Не объявлять старые отчёты доказательством текущего состояния.

## 7. Что запрещено всем исполнителям

- Одновременно менять один файл или один общий ресурс.
- Пушить напрямую в `main` из workspace исполнителя.
- Создавать постоянные ветки/PR без прямого разрешения пользователя.
- Изменять root `package.json`, lockfile, общие types, Worker entrypoint, proxy, migration ledger или shared index без единственного назначенного owner.
- Читать/печатать/передавать секреты, cookies, service-role keys и приватные данные.
- Запускать destructive SQL, массовый импорт/удаление, менять RLS, production secrets, bindings, DNS, storage credentials или production deployment без отдельного подтверждения.
- Считать наличие route, binding, файла или записи доказательством рабочего сценария.
- Утверждать, что модели запущены или задача выполнена, если нет реального результата/patch и проверок.

## 8. Definition of Done

- Каждый блок сдан в пределах назначенных файлов.
- Нет несанкционированных файлов в diff.
- Контракты между блоками совместимы.
- QA/Security review завершён и блокирующие замечания закрыты.
- Пройдены релевантные проверки; непроведённые проверки явно перечислены.
- Координатор интегрировал изменения последовательно в `main` после проверки актуального HEAD.
- В отчёте отдельно указаны: code merged, CI passed, deployed, production smoke-tested. Эти статусы не взаимозаменяемы.

## Связанные правила

- `AGENTS.md` — обязательные инструкции.
- `AGENT-ARCHITECTURE.md` — архитектура команды.
- `AGENT-OWNERSHIP.md` — общая карта владения файлами.
- `AGENT-TASK-PROTOCOL.md` — формат заданий и handoff.
- `AGENT-OPERATING-MODES.md` — выбор размера команды.
