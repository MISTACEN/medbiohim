# MEDBIOHIM — Implementation Audit Pass 14 — 2026-10-06

## Цель

Закрыть первый слой нового master plan: единый AcademicContext contract.

Целевой контур:

`auth user → group → specialty/course/semester → subject UUID → optional lesson → session/schedule version → context key`

## Что изменено

### 1. AcademicContextResolver

`backend/src/Services/AcademicContextResolver.php`

Добавлено:

- `resolveGroup()`;
- `resolveSubject()` с authoritative `subject_id`;
- `resolveAcademicSession()`;
- `resolveLesson()`;
- `resolveForRequest()`;
- `context_version`;
- `semester`;
- `academic_year`;
- `academic_year_id`;
- `session_id`;
- `schedule_id`;
- `lesson_id`.

Старый `requireGroup()` и `resolveForUser()` сохранены как compatibility wrappers, чтобы миграция существующих сервисов не требовала одномоментного переписывания всех маршрутов.

### 2. Group identity

Запрещено выбирать первую membership.

Если у пользователя несколько активных групп и `group_id` не передан:

`GROUP_REQUIRED / 409`

Если передан чужой `group_id`:

`FORBIDDEN / 403`

### 3. Subject identity

Учебный контекст разрешает предмет только по UUID.

`subject_slug`/name не используются как authoritative identity.

Проверка предмета выполняется относительно выбранной группы через:
- schedule membership;
- course;
- specialty.

### 4. Lesson identity

Добавлен resolver конкретного `schedule_entry`.

Он проверяет:
- group;
- active schedule;
- optional subject;
- optional date;
- optional schedule_id;
- optional lesson_id;
- cancellation state.

### 5. Academic session

Session выбирается по:
- course;
- semester;
- optional date;
- `is_current`.

Нет fallback на другую семестровую session.

### 6. Existing route hardening

Исправлены найденные во время Pass 14 runtime/code-contract gaps:

- `student_planner.php` теперь импортирует `AcademicContextResolver` и `AcademicContextException`;
- `srs_rest.php` исправлен: `subjectId` был использован в cards route до объявления;
- `progress_rest.php` больше не превращает двойную ошибку DB/fallback в успешный пустой массив.

## Что уже интегрировано ранее

Pass 9–13 уже дали:
- explicit group enforcement для homework;
- subject UUID validation;
- preparation/test state gates;
- file authorization;
- community group scope;
- user-scoped cache;
- SRS UUID filtering;
- deployment fingerprint;
- `/tests` route fix.

## Что Pass 14 пока НЕ закрывает

Это важный принцип: наличие resolver не означает, что все домены уже используют его.

Остаются migration targets:

- planner должен получать единый context object;
- schedule должен использовать active academic session;
- progress должен иметь explicit academic scope;
- practice/search/lectures должны перестать трактовать slug как identity;
- SRS slug compatibility должен стать только compatibility path;
- tests/preparation должен использовать единый published-test + subject context resolver;
- attendance должен быть переведён на lesson context;
- caches должны включать context version там, где данные context-scoped.

## Hard gate

Pass 14 нельзя считать полностью DONE, пока любой core learning flow может выбрать:
- другую группу;
- другой semester;
- другой subject с тем же slug;
- другой schedule version

без явного context UUID.

## Следующий проход

**Pass 15 — Core academic flow**

Строго:

`Group → Schedule → Subject → Attendance → Homework → Test → Preparation → Progress`

Сначала semantic integration, затем E2E. UI polish не переносится вперед.

## Проверка

После изменения кода обязательны:
- PHP syntax;
- TypeScript/typecheck;
- Next production build;
- route/first-match audit;
- authenticated smoke;
- SpaceWeb artifact fingerprint.

No destructive production data migration was performed.
