# PASS 8 — Cross-feature consistency audit — 2026-10-06

## Цель

Проверить не отдельные endpoint'ы, а сквозной контекст студента:

student identity → group → academic scope → subject UUID → schedule → homework → tests/preparation → attendance → materials → progress → community → SRS.

Аудит выполнен по source на commit `ffd1cbba5cbdc9269635ef5aae033517ae02313c` и live Supabase project `gnobvyjywtqbdfeejxmf`.

## Live snapshot

- active group memberships: 4
- groups: 4
- active subjects: 110
- schedule entries: 309
- homeworks: 0
- published tests: 32
- test_questions: 854
- attendance records: 0
- homework progress: 0
- homework submissions: 0
- gradebook entries: 77
- progress_ledger: 0
- community posts: 0
- SRS cards: 0

Cross-table integrity checks:
- schedule entries with missing subject: 0
- homeworks with missing subject: 0
- test_questions with missing test: 0
- test_questions with missing question: 0
- published tests without questions: 0
- published tests pointing to inactive/missing subject: 0

## P0 — найдено

### 1. Один и тот же student context не является единым resolver'ом

Разные подсистемы самостоятельно определяют scope:
- planner: membership → group;
- homework creation: первый active membership;
- tests: SpecialtyAccess → subject;
- SRS/practice/search/lectures: subject_slug;
- progress/academic planning имеют собственные resolver'ы.

Это означает, что один пользователь может получить разные наборы сущностей при переходе между разделами, даже если все endpoint'ы по отдельности корректны.

Главный дефект — отсутствие единого canonical `AcademicContext` с:
`user_id + group_id + course + semester + specialty + subject_id`.

### 2. Homework creation ломает cross-feature consistency для multi-group

`POST /homeworks` для студента выбирает:

`ORDER BY created_at LIMIT 1`

То есть выбранная группа определяется сервером случайно относительно пользовательского контекста, а не тем, из какой группы/предмета пользователь создаёт ДЗ.

Одновременно fallback передаёт `group_id` из запроса.

Итог: primary и fallback могут создать одно и то же ДЗ в разных группах.

Это P0, потому что сразу ломает:
- planner;
- group visibility;
- submission authorization;
- progress denominator;
- community/context;
- eventual confirmation by starosta.

### 3. Homework progress не привязан к доступности homework

`POST /homeworks/{id}/progress` пишет только `homework_id + user_id`.

Нет проверки:
`homework → group/global scope → membership`.

Следовательно progress может появиться для ДЗ чужой группы и затем попадать в downstream aggregation.

Это уже найденный Pass 7 P0, но Pass 8 подтверждает его как cross-feature corruption.

### 4. Test/preparation subject scope и schedule subject scope не связаны через UUID

Tests уже используют `subject_id`, но frontend/backend вокруг SRS, practice, lectures, search и части content API всё ещё используют `subject_slug`.

Live DB подтверждает, что slug нельзя считать identity:
- chemistry_organic_physical: 3 active rows
- informatics: 3
- physiology: 3
- biology/history/optics/philosophy/математический_анализ: по 2

Следовательно переход:
schedule subject_id → subject_slug → SRS/practice/content
может потерять исходный subject UUID.

## P1 — найдено

### 5. Planner recovery агрегирует по имени предмета

`student_planner.php` использует `subject_name` как ключ recovery.

Если одинаковые/повторные subject rows существуют в разных academic scopes, они объединяются в один recovery bucket.

Нужно агрегировать по `subject_id`, а имя/slug использовать только для display.

### 6. Homework list и planner имеют дублирующую реализацию scope

`HomeworkRepository::listForUser()` и planner SQL самостоятельно реализуют:

`group_id IS NULL OR group_id IN user memberships`.

Сейчас они близки, но это две точки истины. Любое изменение global homework semantics или membership rule может привести к расхождению.

Нужен общий SQL/service resolver.

### 7. Primary/fallback homework paths имеют разные semantics

Primary:
- student group выбирается server-side;
- group is forced from membership.

Fallback:
- request `group_id` может пройти дальше.

Это не просто implementation detail — fallback может изменить academic ownership.

### 8. Test published-state и preparation-state не полностью едины

`listPublished()` фильтрует `is_published=true`, но `findById()` сам по себе нет.

GET/start test и preparation start должны иметь единый `resolvePublishedTestForUser()`.

Иначе опубликованность зависит от конкретной точки входа.

### 9. SRS является отдельным subject namespace

SRS API принимает `subject_slug`, а SrsService группирует карточки по slug.

При существующих duplicate active slugs это не может гарантировать связь карточки с конкретным academic subject UUID.

Для студента это особенно опасно: карточки могут выглядеть как принадлежащие одному предмету, хотя schedule/progress используют другую subject row.

### 10. Empty live data сейчас маскирует отсутствие cross-feature E2E

Live:
- 0 homeworks
- 0 attendance
- 0 progress
- 0 community
- 0 SRS
- 77 gradebook
- 32 published tests / 787 published-test links

Поэтому статическая проверка подтверждает integrity тестов, но не может доказать, что один реальный student action проходит через все домены.

Нужен seeded acceptance scenario, а не только count checks.

## P2 — найдено

### 11. Schedule currently dominates the live group

Live:
- МБХ 201: 3 active members, 308 schedule entries;
- ещё две группы имеют 0 members/0 schedule;
- одна группа имеет 1 member и 0 schedule.

Это не обязательно ошибка данных, но показывает, что group context должен быть явно выбран, а не выводиться через `LIMIT 1`.

### 12. Academic scope отсутствует в части downstream entities

Некоторые сущности идентифицируются только через subject/group без явного semester/course snapshot. При смене семестра старые записи могут быть корректно сохранены, но UI/API должны однозначно понимать, к какому academic period относится запись.

## Что считать правильной архитектурой после Pass 8

Ввести единый resolver:

`AcademicContextResolver::forUser(user_id, requested_group_id?, requested_subject_id?, date?)`

Возвращает:

- user_id
- group_id
- specialty_id/slug
- course
- semester
- academic_year
- subject_id
- schedule_id
- context version

Правила:

1. user_id всегда из auth, не из body;
2. group_id выбирается явно, если пользователь состоит более чем в одной группе;
3. backend проверяет membership;
4. subject_id проверяется внутри group/course/semester context;
5. slug только display/routing alias;
6. schedule, homework, tests, attendance, materials, progress, community и SRS получают context из одного resolver;
7. fallback не может выбирать другой context;
8. cache key включает context fingerprint;
9. global entities имеют явный `visibility_scope`, а не implicit NULL;
10. student action не требует admin approval; shared official state может иметь peer/starosta confirmation.

## Следующий технический порядок

P0:
1. Сделать AcademicContextResolver.
2. Перевести homework create/list/progress/submit на него.
3. Убрать first-membership selection.
4. Сделать primary/fallback semantic parity.
5. Проверить published test через общий resolver.
6. Проверить file authorization в homework flow.

P1:
7. Перевести recovery/SRS/practice/content на subject UUID.
8. Убрать дублирование homework scope.
9. Добавить context fingerprint в cache.
10. Зафиксировать semester/course scope в progress.
11. Community — group scope + explicit visibility.

P2:
12. Создать E2E seed scenario:
schedule → student marks attendance → student creates homework → student completes/submits → starts test → finishes preparation → progress updates → creates SRS card → posts to group community.
13. Проверить reload/retry/duplicate click на каждом переходе.
14. Проверить тот же сценарий после смены active semester/context.

## Итог

Pass 8 не обнаружил текущей физической порчи связей schedule/tests/subjects: orphan checks = 0.

Но обнаружена более важная архитектурная проблема: **cross-feature identity не является единой**. Сейчас разные функции по-разному определяют группу/предмет/academic scope, поэтому система может быть локально исправной и одновременно выдавать студенту разные данные в разных разделах.

Главный следующий шаг — не добавлять новые UI-обходы, а сначала централизовать academic context и затем последовательно подключить к нему все домены.
