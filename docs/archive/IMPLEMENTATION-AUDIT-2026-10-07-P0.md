# P0 implementation pass — 2026-10-07

## Что проверено

Проверены текущие main и production-gate части: GitHub Actions configuration; Vercel status; backend route registration; tests/curriculum-map; test start/detail/answer/finish flow; immutable question snapshots; group-scoped attempt history; preparation group scoping; project roadmap and release gates.

## Найдено и исправлено

### 1. Curriculum-map exception handler

В backend/config/routes/tests.php был повреждён namespace exception handler: catch (\\Throwable $e). Исправлено на корректный catch (\Throwable $e).

### 2. Curriculum topic plan metadata

TestRepository::curriculumMap() использовал planned_date и curriculum_item_type, но эти значения не выбирались из curriculum_items.

Исправлено: добавлена связь curriculum_items с topic; выбирается активная запись плана; возвращается planned_date; item_type возвращается как curriculum_item_type; выбор ограничен одной актуальной записью на topic; сохранена сортировка по planned date/order.

Это восстанавливает связь: учебный план → тема → вопросы/тесты → дата занятия.

## Production gate

На текущем GitHub status для последнего проверенного commit присутствовал: Vercel: failure — build-rate-limit.

Это инфраструктурный лимит Vercel, а не доказанная ошибка PHP-кода. Production READY не заявляется.

GitHub Actions для проверенного commit отдельного workflow run результата не предоставил, поэтому CI также не считается зелёным до фактического запуска.

## Что остаётся P0

1. Получить фактический GitHub Actions result после изменений.
2. Получить Vercel READY deployment после снятия build-rate-limit.
3. Выполнить production smoke: login; /api/v1/me; dashboard; schedule; subjects; tests; preparation; question bank; materials; trainer/atlas; admin.
4. Проверить актуальный SpaceWeb backend/runtime.
5. После production gate перейти к следующему P0: physical Histology media + Materials delivery и unified Schedule/Homework flow.

## Правило

Отсутствие runtime/CI подтверждения не трактуется как ошибка и не трактуется как успех. Кодовые исправления фиксируются отдельно от production verification.


## Дополнительный verification/fix cycle — 2026-10-07

После первого P0 прохода выполнена повторная проверка уже изменённых файлов до перехода дальше.

### Найдено и исправлено

1. `src/app/tests/page.tsx`
   - после интеграции единого химического банка в JSX остался незакрытый/неправильно вложенный блок истории попыток;
   - это был реальный риск ошибки production build;
   - блок химического банка и блок истории попыток разделены и восстановлена корректная вложенность JSX.
   - commit: `cfa386e6f8ac3a8b3ba2005fbdbce4d16c6070fc`.

2. `backend/config/routes/admin.php`
   - `/api/v1/admin/db/meta` выполнял заведомо бесполезный запрос к `information_schema_columns_not_exposed`;
   - запрос удалён, метаданные теперь получают колонки из реального sample-row.
   - `/api/v1/admin/content/validate` проверял `exam_questions.type`, но поле `type` не выбиралось из REST-запроса;
   - `type` добавлен в SELECT, поэтому проверка MC/MCQ/case снова имеет смысл.
   - commit: `59e38d9664645556bd2fca64ea6d97f998a5f200`.

### Повторная проверка deployment pipeline

- Vercel автоматически создал production deployment для `cfa386e6...`: состояние было `BUILDING`.
- После следующего серверного исправления создан новый deployment для `59e38d96...`: состояние на момент фиксации — `QUEUED`.
- Это означает, что новые изменения действительно дошли до связанного Vercel проекта.
- GitHub Actions для нового коммита через доступный endpoint пока не вернул workflow run; это не считается зелёным CI.
- Production runtime/auth всё ещё не считаются подтверждёнными до READY + smoke exact deployed artifact.

### Правило продолжения

Переход к следующему этапу выполняется только после повторной проверки текущего исправления. Если build/runtime снова выявляет дефект — сначала исправление и повторный цикл, затем следующий пункт.


## Verification cycle — health/security — 2026-10-07

### Исправлено

- `backend/src/Health/HealthChecker.php` больше не возвращает через health API DB host/port/user.
- При ошибке подключения health API также не возвращает сырые диагностические строки, которые могли раскрывать инфраструктурные сведения.
- Health сохраняет полезный статус `healthy/degraded/unhealthy` и безопасные сообщения для диагностики без публикации topology/connection details.
- commit: `5237e9938866d8a35c6e045381114cc8b0c461ea`.

### Verification result

- Последний подтверждённый READY production deployment остаётся commit `59e38d9664645556bd2fca64ea6d97f998a5f200`.
- Для `5237e993...` Vercel status сейчас `failure` из-за внешнего `build-rate-limit`; deployment не создан/не стал READY.
- Поэтому health security fix пока проверен на уровне исходника, но не через production runtime.
- Никаких проверок/функциональности ради обхода free-tier build limit не отключалось.


## Verification cycle — Histology Materials physical-file delivery — 2026-10-07

### Confirmed architecture issue

Supabase `materials` records can point to physical Histology files through `content_sources.source_path`, while the actual binary archive lives on SpaceWeb under `content/histology`. The generic `/api/v1/materials` response previously only produced a `download_url` when the file existed in B2. Therefore a valid SpaceWeb-only Histology source could appear in metadata but have no browser-openable URL.

### Fixed

- Added authenticated frontend loader `getMaterialFileUrl()` for `/api/v1/materials/{id}/file`.
- It refreshes an expired access token, downloads the physical file as a Blob, and creates an object URL.
- Generic Materials page now falls back to this loader for Histology materials when no B2 `download_url` exists.
- Existing B2 path remains preferred; no duplication of physical Histology media into Supabase/B2 is required.
- Existing dedicated `HistologyMaterials` component already uses the authenticated `fetchMaterialFile()` path.
- commits: `969c546d83024fe533e364ca1990f2cc1ed3b3d6`, `51ac7792019e8a5e7b724711d51a2080c164d07f`.

### Verification gate

Physical SpaceWeb files still require target-runtime HTTP verification. Vercel's current build-rate limit prevents a new deployment for these latest commits, so this fix is currently source-verified, not production-runtime-verified.


## Verification cycle — question-bank isolation + Supabase security — 2026-10-07

### Findings

1. Question-bank filtering is subject-slug based at the public library boundary. The database currently contains duplicate subject slugs for some subjects: histology has 2 rows and chemistry_organic_physical has 3 rows. The question bank endpoint therefore relies on exam_questions.subject_slug rather than a unique subject UUID in this UI path. This is safe only while the denormalized question subject_slug remains canonical; it is a P1 hardening item to make subject UUID/context authoritative and prevent accidental cross-semester mixing.
2. Critical Supabase advisory: public.chemistry_source_documents currently has RLS disabled. This table is not the canonical runtime question bank, but it contains source/provenance metadata and is nevertheless exposed to Supabase client roles. Supabase marks this as rls_disabled / critical. Per safety policy, RLS is not being enabled automatically because enabling it without explicit policies can block legitimate access. Proposed safe policy is authenticated read-only access (or server-only access if the table is not consumed by the client).
3. The homework API already exposes one derived my_status / my_status_source, so the previously identified dual-state issue is not currently a source-code regression in these read paths.
4. Trainer Histology image delivery already validates the real path against the configured root and supports both canonical and legacy 5_Фотографии препаратов layouts; no additional source defect was found in this cycle.

### Verification result

- Repository HEAD is 218bd3550cae4cb1f5a4cfa65ec33d2632a4e9f5.
- Latest production READY deployment remains 59e38d9664645556bd2fca64ea6d97f998a5f200; later security/material fixes are not yet production-runtime verified.
- Vercel runtime-errors API is currently inaccessible with the connected project credentials (403), so no claim of a clean production runtime is made.
- No destructive DB change was made for the RLS finding.
