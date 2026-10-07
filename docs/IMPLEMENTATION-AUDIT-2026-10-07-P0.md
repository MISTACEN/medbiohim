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
