# MEDBIOHIM — semantic + code contract audit / Pass 4–5 / 2026-10-06

Цель: продолжить полный аудит после Pass 1–3. Эти два прохода проверяют: (1) смысловую модель «от студентов — для студентов»; (2) реальные контракты frontend → API → service → DB → result.

# Pass 4 — semantic/product audit

## A. Глобальная архитектурная инварианта
MEDBIOHIM — от студентов для студентов.
Правильная модель: student → own action → own/group result → optional peer/starosta confirmation → shared state.
Неправильная модель: admin/teacher approval → student action.
Подтверждение допустимо только для общего группового факта, спорного контента или модерации. Оно не должно блокировать обычное действие студента для себя.

## A1. Attendance — correction
Текущий код правильно позволяет студенту самостоятельно отметить present, excused, sick, unexcused. Это не нужно запрещать.
Проблема в том, что эти значения нельзя автоматически считать официально подтверждённым фактом.
Целевой контракт: self_report → optional confirmed → optional override с audit trail. Студент может менять собственную отметку пока период открыт. Confirmation — дополнительный слой, не gate.

## A2. Homework — student-first
Student-created homework допустим по продуктовой модели. Найденная проблема — context-selection bug: backend при создании студентом выбирает первую active membership через ORDER BY created_at LIMIT 1.
Если у студента несколько групп, он должен явно выбрать group_id, а backend проверить membership.

## A3. Community — group scope
Пост студента должен иметь author_id и group_id, с отдельным явным типом для global visibility.
Сейчас create/list работают без group_id. Это ломает цепочку student → current group → community.
Цель: обычный пост → активная группа; глобальные публикации — отдельный явно разрешённый тип; starosta/group moderator модерирует группу; admin занимается системной/global moderation.

## A4. Community author identity
Backend хранит author_id, но активный UI не получает полноценную identity/display_name и может показывать generic «Студент». Нужен стабильный attribution.

## A5. Community comments
comments существуют в DB/RLS, но пользовательского lifecycle не найдено. Значит комментарии пока не являются готовой функцией.
Нужен полный цикл: comment → display → edit/delete own → report → moderation → result.

## A6. Student contributions
Модель student contribution → peer/starosta confirmation правильная и должна применяться к заметкам, уточнениям лекций, предложениям исправлений, полезным материалам, вопросам и групповым подсказкам.
Canonical academic content нельзя превращать в произвольную student-editable таблицу.

## A7. Schedule corrections
Нужно разделить official schedule и student/group correction proposal.
Студент может предложить неверную пару, замену, аудиторию, отмену или перенос. Ответственный студент может подтвердить group-level correction. Official source/admin может финализировать canonical schedule.
При этом личный planner студента не должен блокироваться неподтверждённой коррекцией.

## A8. Knowledge gaps
Knowledge gap — student-owned state. Студент сам отмечает непонятое, с привязкой к subject/topic/question UUID. Group aggregation может быть отдельным слоем; starosta не должен разрешать личный gap.

## A9. Notes/favorites
Это полностью student-owned функции. Нужны create, update, clear/delete, reload-safe toggle и target existence validation.

## A10. Telegram
Целевой flow: message/photo → student/group context → candidate → student correction → optional starosta confirmation → shared homework.
Low confidence не должна автоматически становиться официальным объектом, но admin не должен быть обязательным посредником.

# Pass 5 — code/API/DB contract audit

## B1. Production build скрывает ошибки типов
next.config.ts содержит eslint.ignoreDuringBuilds=true и typescript.ignoreBuildErrors=true. Production build может пройти при наличии TypeScript/ESLint ошибок.
Цель: CI отдельно выполняет tsc --noEmit и ESLint; production build не является единственным доказательством качества. После очистки ошибок вернуть strict build. P1.

## B2. Router regression vs current source
Текущий backend/config/routes.php типизирован через Medbiohim\\Http\\Router; Bootstrap создаёт именно Medbiohim\\Http\\Router. В текущем source tree контракт согласован.
Поэтому прежняя production-ошибка Argument #1 router с высокой вероятностью указывает на runtime/deployment source mismatch, stale deployment, duplicate class/path или environment drift, а не на текущий type hint.
Нужно проверять target SpaceWeb: exact deployed commit/archive, routes.php, Router class, health/auth smoke. Не переписывать type hint вслепую.

## B3. Router first-match semantics
Router::dispatch() останавливается на первом совпавшем route. Поэтому duplicate/shadowed routes опасны. CI должен проверять не только exact duplicates, но и shadowing/order conflicts.

## B4. Homework fallback semantic divergence
POST /homeworks имеет primary HomeworkRepository и fallback SupabaseRest. Обе ветки обязаны одинаково валидировать group_id, membership, created_by, created_by_role, subject_id и due_at.
Сейчас student path primary сам выбирает первую membership, а fallback может принять переданный group_id напрямую. Это semantic divergence.

## B5. Community fallback semantic divergence
community_rest.php primary использует SupabaseAcademic, fallback ContentStore. Fallback тоже обязан сохранять group scope, author identity, visibility и moderation metadata.

## B6. Community API lifecycle incomplete
Найден GET + POST, но active student API lifecycle для edit own, delete own, report и comments не найден.

## B7. Attendance provenance
POST /attendance/{entryId} правильно ограничивает запись собственным пользователем и проверяет принадлежность пары к группе.
Но для официальной аналитики DB contract должен отличать reporter, confirmer, confirmed_at и previous status, если confirmation используется.

## B8. Planner recovery uses subject_name
student_planner.php группирует recovery через subject_name. При duplicate subject names/slugs разные UUID могут попасть в один bucket.
Использовать subject_id как aggregation key, name только как display.

## B9. Schedule legacy migrations resolve subject by name
Старые migrations содержат SELECT id FROM subjects WHERE lower(name)=... AND semester=... LIMIT 1. При duplicate active subjects это недетерминированный resolver.
Новые/correction migrations должны использовать canonical subject UUID. Старые не переписывать без необходимости; validators должны обнаруживать ambiguous resolution.

## B10. SRS resolves names by slug
SrsService строит subject map by slug. При duplicate active slugs один slug может перезаписать другой.
SRS должен использовать subject_id как identity, slug — только display/routing metadata.

## B11. Progress academic scope
Progress denominator должен использовать единый resolver: current user → active memberships → academic context → entities. Нельзя смешивать global homework rows с user academic scope.

## B12. Runtime build fingerprint
X-Medbiohim-Build существует в Next config. Наличие fingerprint в source не доказывает, что target runtime отдаёт этот source.
Acceptance должен сравнивать Git commit, frontend fingerprint, backend build marker, API health и auth/me.

## B13. Empty vs unavailable
Fallback chains обязаны различать DB unavailable → 503/degraded; valid empty → 200 empty; forbidden → 403; invalid context → 409/422; stale cache → explicit stale metadata.
Нельзя возвращать fake empty success при отказе backend.

## B14. return [] is not automatically a stub
Новый scan подтверждает, что многие return [] являются валидным empty state. Подозрительны только пути, где catch проглатывает реальный failure или UI принимает failure за отсутствие данных.

## B15. Tests need semantic route acceptance
Из-за redirect /tests → /subjects HTTP 200 недостаточен. Acceptance должен проверять intended destination, test-bank controls, отсутствие unexpected redirect и API calls страницы.

# Newly confirmed priority matrix

## P0
1. SpaceWeb runtime/source mismatch around Router regression.
2. Auth smoke на exact deployed artifact.
3. Homework primary/fallback semantic equivalence.
4. DB failure must never become fake empty success.
5. Same-commit frontend/backend proof.

## P1
1. Student-first permission model across attendance/community/homework/schedule/knowledge gaps.
2. Community group scope + author + mutation lifecycle.
3. Attendance provenance/confirmation without blocking self-report.
4. Subject UUID everywhere identity matters.
5. Planner/recovery UUID aggregation.
6. SRS UUID subject identity.
7. Progress academic-scope resolver.
8. Remove/contain ignoreBuildErrors and ignoreDuringBuilds.
9. Route shadowing/order detector.
10. Runtime build fingerprint verification.

## P2
1. Comments full lifecycle.
2. Entity-level version history.
3. SRS E2E.
4. AI chat E2E.
5. Telegram candidate/confirmation UX.

# New Definition of Done — semantic version
Feature is DONE only if:
1. Student can perform the action appropriate to them without unnecessary admin approval.
2. Shared/group-wide effects have an explicit optional confirmation/moderation layer.
3. Stable UUID identifies every academic entity.
4. Frontend and backend use the same context resolver.
5. Primary and fallback paths have the same semantics.
6. Empty, unavailable, forbidden and invalid states are distinguishable.
7. Reload/duplicate/retry are safe.
8. Audit/provenance exists where the result is treated as official.
9. Mobile path is usable.
10. Exact deployed artifact is E2E verified.