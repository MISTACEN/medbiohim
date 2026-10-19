# MEDBIOHIM — аудит репозитория и кандидатов на очистку
Дата проверки: 2026-10-19
Ветка: `main` (единственная целевая для рабочих изменений)
Область: GitHub tree, ключевые архитектурные файлы, CI/CD workflows, Supabase inventory/migration ledger, загруженные архивы. Это статический/конфигурационный аудит, не полный browser acceptance.

## Краткий вывод

**Пока ничего не удалять.** В репозитории есть настоящие кандидаты на очистку, но несколько старых деревьев всё ещё участвуют в fallback, восстановлении или миграции. Самые важные проблемы сейчас — не размер репозитория сам по себе, а конфликтующие документы, несколько поколений backend-кода, migration-history drift и ручные GitHub Actions, способные автоматически переписывать `main`.

На момент проверки:
- GitHub `main`: `da1616f219af45ac575f5fe149b0eff812f54685`.
- Vercel deployment для этого commit: `READY` (production target).
- Рекурсивный GitHub tree: **835 файлов**, **142 каталога**.
- Документы: **167 Markdown-файлов**; `docs/` содержит **210 файлов**.
- Кодовые деревья: `src/` 125 файлов, `workers/api/` 61, `integrations/cloudflare-api/` 80, `backend/` 145.
- GitHub Actions: **26 workflow YAML-файлов**, плюс служебные файлы.
- Supabase: **86 таблиц** в просмотренных схемах; у всех 86 включён RLS. У 50 таблиц есть строки, 36 пустые на момент снимка. Пустая таблица сама по себе не означает, что её можно удалить.
- Удалённая история Supabase содержит **148 применённых migration records**. В репозитории есть SQL в нескольких местах: `database/migrations/` (116 файлов), `supabase/migrations/` (6), `backend/database/migrations/` (8), а также SQL вне этих каталогов. Это не 1:1 зеркало remote ledger; текущая документация уже предупреждает не выполнять слепой `supabase db push`.

## Приоритет P0 — предотвратить случайную перезапись кода

### 1. Ручные GitHub Actions пишут прямо в main
Ряд workflows имеет `workflow_dispatch`, `contents: write` и шаги `git push origin HEAD:main`. Некоторые используют жёстко заданные старые commit SHA, целиком восстанавливают файлы из истории или копируют файлы из `scripts/p0` и Base64 payloads.

Примеры для отдельного решения:
- `.github/workflows/restore-contract-tests.yml` — восстанавливает тест/код из исторического commit и делает push в main.
- `.github/workflows/fix-questions-miniquiz.yml` — восстанавливает `questions.ts` из фиксированного старого commit.
- `.github/workflows/restore-schedule-page.yml` — восстанавливает страницу расписания из фиксированного старого commit.
- `.github/workflows/fix-groups-subjects.yml` — принудительно копирует route-файлы из `scripts/p0`.
- `.github/workflows/apply-personal-cabinet.yml` — декодирует Base64 в dashboard/my routes и делает push.
- `.github/workflows/apply-p0-academic-crud.yml`, `apply-p0-v2.yml`, `apply-p1-ui-schedule-db.yml`, `apply-p1-v2.yml`, `apply-admin-database.yml`, `apply-db-writes.yml` — инжектируют/перезаписывают код и могут пушить изменения.

Риск: при случайном ручном запуске они могут вернуть устаревшую реализацию поверх более нового кода. Это не значит, что все они уже не нужны; их нужно проверить по текущим файлам и истории запусков. Рекомендация: заменить на обычные тесты/patch scripts без push либо явно архивировать после проверки, что их результат уже в текущем коде. До такого решения не запускать их «для проверки».

### 2. Найден workflow-файл, который не является workflow
`.github/workflows/apply-p0-embedded.yml` содержит только текст `PLACEHOLDER_TOO_LARGE_USE_SCRIPTS` (33 байта). Это не действующий YAML workflow и кандидат на удаление/перенос в архив после проверки, что он не нужен как исторический маркер.

## Приоритет P1 — несколько поколений backend и разная актуальность документации

### 3. Три backend-дерева
- `workers/api/` — документирован как канонический production Worker `medbiohim-api`.
- `integrations/cloudflare-api/` — старый JS-монолит `medbiohim-api-shadow`, оставлен как fallback через service binding. Он всё ещё потенциально обслуживает маршруты, не реализованные в canonical Worker, поэтому удалять его нельзя, пока не доказано, что fallback больше не нужен.
- `backend/` — PHP/SpaceWeb legacy, 145 файлов. Пользовательский план — держать SpaceWeb замороженным; дерево сохраняет старые обработчики, данные и миграционные источники.

Рекомендация: построить точную route-матрицу frontend → canonical Worker → shadow fallback → legacy PHP. Для каждого маршрута отметить: production handler, контрактный тест, реальная проверка, можно ли удалить legacy-код. Только после этого архивировать отдельные модули.

### 4. Документация противоречит сама себе
Подтверждённые примеры:
- `README.md` сначала описывает production цепочку Browser → Vercel → SpaceWeb PHP, а ниже говорит, что Vercel proxy отправляет API только в `medbiohim-api` на Cloudflare.
- `docs/STATUS.md` датирован 2026-10-15 и всё ещё объявляет PHP/SpaceWeb production API и Cloudflare shadow.
- `docs/ARCHITECTURE.md` описывает shadow как текущий Worker и содержит старые утверждения о не переключённом production.
- `integrations/cloudflare-api/README.md` содержит исторические статусы, что production cutover не завершён.
- `docs/WORKERS-TOPOLOGY.md` и `workers/api/README.md` описывают более новую схему: `medbiohim-api` — canonical production, shadow — fallback only.

Рекомендация: оставить один краткий актуальный архитектурный источник; исторические наблюдения переместить/пометить как snapshots с датой. Не удалять старые записи о проблемах — убрать только их статус «актуально сейчас».

### 5. Огромные файлы статуса накапливают журнал вместо карты проекта
- `ROADMAP.md`: около 429 KB.
- `PHASES_STATUS.md`: около 341 KB.
- `SYNC_STAMP.md`: около 47 KB.
- В `docs/` — 210 файлов, в том числе много PASS-/handoff-/date-stamped снимков.

Это не причина удалить историю, но затрудняет поиск реального текущего статуса и увеличивает риск читать устаревшие выводы. Рекомендация: короткие текущие ROADMAP/PHASES_STATUS/SYNC_STAMP + отдельный `docs/archive/` для неизменяемых исторических snapshots; перед переносом проверить ссылки и не потерять доказательства проверок.

## Приоритет P1 — Supabase migration source-of-truth

### 6. История применённых миграций и SQL в Git не являются единым очевидным потоком
Remote Supabase ledger: 148 applied records. SQL хранится сразу в `database/migrations/`, `supabase/migrations/`, `backend/database/migrations/` и других местах. Некоторые migration names повторяются в remote ledger (например, несколько версий `restore_histology_preparation_catalog` и `publish_valid_histology_cyto_embryo_questions`); есть два файла с одинаковым basename `secure_histology_training_lifecycle.sql`, но разными timestamp/version.

Риск: трудно безопасно воспроизвести production schema с нуля и понять, какой файл был применён. Не считать простое различие количества файлов доказательством конкретно отсутствующей миграции: нужна сверка по remote version/name, содержимому и историческим источникам.

**Запрещённая операция до завершения аудита:** не запускать `supabase db push`, не переименовывать старые миграции и не удалять SQL ради «дедупликации». Сначала составить матрицу remote ledger ↔ source file ↔ checksum ↔ schema object, затем определить безопасный baseline/reconciliation.

## Приоритет P2 — возможные кандидаты на сокращение

### 7. Дублирование артефактов и сборок
- `.github/workflows/package-archives.yml` собирает полный архив и PHP backend archive.
- `.github/workflows/build-spaceweb-archive.yml` отдельно собирает SpaceWeb backend archive.
- Это может быть осознанной разницей артефактов, но функции частично пересекаются. Сверить, какие архивы реально нужны; затем объединить или отключить один workflow.
- `.github/workflows/_questions.b64` имеет 15 байт и не найден по текстовым ссылкам в текущем коде; кандидат на удаление после проверки git history/назначения.
- `scripts/admin-restore/*.b64`, `scripts/cabinet/*.b64`, `scripts/p0/*.b64` и `*.snippet` нельзя удалять, пока активные ручные workflows ссылаются на них.

### 8. Старые JSON-данные PHP
`backend/data/` содержит расписание, каталог предметов, учебный план и банки вопросов. Документация говорит, что это legacy import source, не production source of truth. Но эти файлы могут быть единственным удобным исходным снимком части данных. Сначала сравнить с Supabase по строкам/контенту и checksum, после чего пометить подтверждённые копии архивными; не удалять до подтверждения полноты импорта.

### 9. Загруженные ZIP-архивы
- `public_html-31(1).zip`: 1003 файла, ~154.82 MiB распакованного содержимого; включает PHP, SQL, JSON и учебные материалы гистологии.
- `medbiohim-cloudflare-api 2.zip`: 60 файлов, ~0.95 MiB — старый Worker-пакет.
- `medbiohim-cf-push.zip`: один JS-файл, ~0.12 MiB.
- `medbiohim-migration-audit 2.zip`: 17 файлов с миграционной документацией.

Это локальные входные архивы, не доказательство, что все файлы актуальны в production. Они не занимают место в GitHub tree. Не удалять оригиналы до сопоставления важных материалов, миграций и медиа с каноническим хранилищем.

## Что не следует считать ненужным без доказательств

- `integrations/cloudflare-api/` — пока есть service binding fallback.
- `backend/` и `backend/data/` — до завершения route parity и сверки импортированных данных.
- `database/migrations/` и `supabase/migrations/` — до сверки с remote ledger.
- `scripts/**.b64` и `*.snippet` — пока есть workflow references.
- Пустые таблицы Supabase — их наличие не доказывает, что они не используются будущими/редкими маршрутами.
- Исторические документы аудита — сохранять как архив, если они являются единственным источником происхождения изменений.

## План продолжения аудита

1. **Сверить маршруты:** все 46 frontend page routes, вызовы `src/lib/api.ts`, API proxy, 41 canonical Worker route, shadow route families и PHP endpoints. Результат — список живых/неживых функций и точные точки расхождения.
2. **Проверить workflows:** определить последний успешный запуск, текущие ссылки на snippets/Base64 и дубли. Сначала обезопасить workflows, которые пишут в main; не запускать их.
3. **Сверить SQL:** remote migration ledger, все SQL-файлы во всех каталогах и фактические schema objects; никаких изменений production DB на этом этапе.
4. **Проверить frontend:** мёртвые страницы/компоненты/imports, старые URL, дубли API helpers, error handling и build/typecheck.
5. **Проверить данные и медиа:** source JSON/archive → Supabase rows → Blob objects → UI; отдельно schedule, histology, physiology, organic/physical chemistry.
6. **Сформировать таблицу cleanup:** `KEEP`, `ARCHIVE`, `REMOVE` с доказательствами references/runtime/backup и оценкой риска.
7. Удалять/архивировать только после проверки production route parity, сохранности данных и успешной сборки. Все изменения — напрямую в `main`, как требуется; production secrets и сервисы без отдельного согласованного шага не менять.

## Ограничения текущего прохода

- Не выполнен полный браузерный тест с реальной пользовательской сессией.
- Не выполнен checksum-by-checksum diff всех локальных архивов и production Blob objects.
- Не проверено, что каждая таблица с нулём строк действительно не используется.
- Текущая инвентаризация не является разрешением на удаление каких-либо файлов.


## Дополнение — frontend API client (проверено 2026-10-19)

- `src/lib/api.ts` начинается комментарием `API client for SpaceWeb backend`, а stale-cache comment говорит о `SpaceWeb/Supabase`; фактический `src/app/api/v1/[...path]/route.ts` сейчас проксирует только на canonical Cloudflare origin и при недоступности возвращает 502, не переключая запросы на PHP.
- Это ещё один признак, что миграционные комментарии не обновлены. Не удалять сам `api.ts`: это основной клиент с авторизацией, refresh, кэшированием и диагностикой; исправить только неточные комментарии после полного route audit.
- Canonical Worker `workers/api/src/index.ts` содержит fallback на shadow только при статусе 501 через service binding. Поэтому правильная фактическая схема: Browser → Vercel same-origin proxy → `medbiohim-api` → (только для 501) `medbiohim-api-shadow`. PHP/SpaceWeb не является Vercel runtime fallback в текущем коде.


## Дополнение 2 — route parity (2026-10-19)

Добавлен отдельный отчёт [API-ROUTE-PARITY-AUDIT-2026-10-19.md](API-ROUTE-PARITY-AUDIT-2026-10-19.md). Проверены текущие исходники `src/lib/api.ts`, `src/app/api/v1/[...path]/route.ts`, `workers/api/src/index.ts`, ключевые canonical route modules и старые route inventories.

Подтверждено:
- Vercel proxy не имеет PHP fallback: он отправляет запросы только в `CLOUDFLARE_API_ORIGIN` и при сетевой ошибке возвращает 502.
- Canonical Worker прокидывает в shadow только HTTP 501 через `MEDBIOHIM_UPSTREAM`. Следовательно, shadow остаётся runtime dependency, пока неизвестные/неперенесённые маршруты возвращают 501.
- Frontend действительно вызывает trainer feed/card/answer/image, material file-url/file, histology source-file, file upload/download. В canonical source найдены соответствующие handlers.
- Оба роутера `preparation` и `tests` монтируются на `/tests`; нужно отдельно протестировать пересекающиеся пути и precedence.
- README исправлен: убрана противоречивая старая цепочка через SpaceWeb и список веток; описана схема через canonical Worker и 501-only shadow fallback.
- Устаревший комментарий в `src/lib/api.ts` исправлен. Сам клиент оставлен.

Коммиты аудита на `main`:
- Route parity report: `3c0262a7d62533fbcda0dc11f913a155defeb706`
- README topology correction: `4512300edadb102949acf0a45d243f4f4a6edcb3`
- Shared API client comment: `68f7dbc52353940a185b98cf02d70179156180ed`

Это статическая проверка. Production Worker bundle, authenticated RLS, Blob object reads и browser UI не объявляются подтверждёнными только на основании исходников.


## Дополнение 4 — live route/media/migration checks (2026-10-19)

- Production route and media smoke: [PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md](PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md).
- Migration ledger reconciliation: [MIGRATION-LEDGER-RECONCILIATION-2026-10-19.md](MIGRATION-LEDGER-RECONCILIATION-2026-10-19.md).
- Added admin route parity module and fixed the Hono finalized-response fallback; Cloudflare version 82 is active at 100% traffic; deploy workflow succeeded.
- Found a source/history mismatch: 148 live migration records versus 139 repository SQL files; only 6 exact version+name matches and 101 ledger names without an exact current basename. No SQL was run or deleted.
- Tested all 206 published histology image endpoints; 0 returned image bytes, all 206 returned 404. Bucket listing credential is rejected. Do not call the atlas restored until objects are revalidated.


CI follow-up: the stale private-media cache assertion in `scripts/predeploy-audit.mjs` was corrected to match the actual implementation; frontend code-check run [39256338205](https://github.com/MISTACEN/medbiohim/actions/runs/39256338205) passed. Vercel production deployment for commit `0dfee6556a927d2b23183a94222b2d5fa59639fc` is READY.


## Дополнение 5 — проверка 2026-10-20

- Исправлен API-контракт приоритета работ: база разрешает `urgent`, прежний Worker API отклонял его. Исправлены оба валидатора и добавлена проверка контракта; Worker version 83 активен, CI/smoke прошли.
- Добавлен `package-lock.json`: локальный `npm ci`, frontend typecheck/build и Worker 35 тестов проходят; npm audit сообщает 0 уязвимостей. Production Vercel deployment для commit `b62aa4ad8634423eac07b547dee2021c8574c7e4` имеет READY.
- Сопоставление гистологии: 206/206 карточек имеют соответствующий путь в `histology_assets`, но Blob inventory/signing недоступны из-за отклонённого bucket token, а production отдаёт 206/206 404. Физическое наличие объектов не подтверждено.
- Authenticated student/admin CRUD не запускался без тестовой сессии. Production data не изменялись.


## Follow-up verification — 2026-10-20

- `.github/workflows/_questions.b64` is already absent from current `main`; a fresh code search finds only documentation references. It is not an outstanding file-deletion task.
- `.github/workflows/build-spaceweb-archive.yml` was removed after checking its only output artifact had no source/workflow consumers. `package-archives.yml` still produces a generic backend archive, so the backup artifact function remains.
- Histology temporary media was recovered through the shared Google Drive folder: 178/178 original photos and 28/28 electronogram previews are mapped; the canonical Worker was deployed and all 206 production image endpoints returned HTTP 200 with image bytes. See [media audit](PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md).
