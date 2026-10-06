# MEDBIOHIM — INTEGRATION MASTER PLAN v2 — 2026-10-06

## 0. Архитектурное правило

Единый контур:
`auth user → AcademicContext → domain entity → action/state → result → audit/moderation`.

Для учебного действия AcademicContext обязан иметь:
- user_id;
- group_id;
- specialty/program;
- course;
- semester;
- academic_year;
- subject_id;
- optional schedule_id / lesson instance;
- context_key/version.

`subject_id` и `group_id` — authoritative UUID.
`subject_slug`, subject name и group name — только aliases/display.

Нельзя:
- выбирать группу по первой membership;
- выбирать предмет через `slug + LIMIT 1`;
- подменять DB failure пустым массивом;
- считать self-report официальным подтверждённым фактом;
- создавать shared state без контекста;
- разрешать service-key backend больше, чем разрешает продуктовая policy.

---

# 1. Pass 14 — Context foundation

### Сделать
1. Расширить `AcademicContextResolver` до полного context object.
2. Добавить отдельные методы:
   - `resolveGroup()`
   - `resolveSubject()`
   - `resolveLesson()`
   - `resolveForRequest()`
3. Вернуть `semester/academic_year/schedule_id/context_version`.
4. Добавить единые ошибки:
   - `NO_GROUP`
   - `GROUP_REQUIRED`
   - `FORBIDDEN`
   - `INVALID_SUBJECT_CONTEXT`
   - `INVALID_LESSON_CONTEXT`
5. Запретить implicit fallback на другую группу/семестр.
6. Контекст сделать единым источником для backend services.

### Acceptance
Один запрос с group_id + subject_id всегда возвращает один и тот же context_key во всех доменах.

---

# 2. Pass 15 — Core academic flow

Интегрировать строго в таком порядке:

`Group → Schedule → Subject → Attendance → Homework → Test → Preparation → Progress`

### Schedule
- active academic session вместо hardcoded dates;
- timezone из academic context;
- logical lesson/pair ID;
- alternating/split pairs сохраняются как одна учебная сущность;
- official schedule отдельно от student proposal.

### Attendance
Состояния:
`self_reported → confirmed → amended`.

Студент может изменить свой self-report.
Подтверждение starosta/другой authority — отдельное поле/история.
Self-report никогда не должен блокировать planner.

### Homework
Разделить:
`shared homework`
и
`personal completion`
и
`submission`
и
`grading`
и
`returned/resubmission`.

Одна canonical state machine.
Progress и submission не должны расходиться.

### Tests
Единый resolver:
`published test → subject UUID → group/academic context`.

### Preparation
`session owner + test + question_ids + status`.
Разрешены только валидные transitions.

### Progress
Одна формула и один academic scope.
Каждый результат должен иметь source:
- homework;
- test;
- preparation;
- attendance;
- gradebook.

---

# 3. Pass 16 — Content trust

### Unified Content Item

Question → Test → Bank → Exam → Report → Work Item → Version → Publication.

Для question:
- UUID;
- subject/module/topic;
- source;
- options;
- correct answers;
- tests using it;
- reports;
- version;
- published/archived;
- validation state.

### Report lifecycle

`report → snapshot → review → work item → edit → validate → publish → resolve → notify`.

Snapshot обязателен:
- question/options;
- selected answer;
- test/bank;
- preparation session;
- mode/position;
- academic context;
- timestamp.

`fixed` ≠ `validated` ≠ `published`.

---

# 4. Pass 17 — Student contributions + Community

Community:
`student → selected group → post → comments → report/edit/delete → optional starosta confirmation`.

По умолчанию group-scoped.
Global post — отдельный explicit visibility scope.

Добавить:
- author identity;
- comments lifecycle;
- student report;
- own edit/delete;
- moderation history;
- confirmation queue.

Notes:
- create/update/delete;
- target existence.

Favorites:
- target whitelist;
- target existence;
- delete.

---

# 5. Pass 18 — Automation

## Telegram

`Telegram identity → group membership → message → date/time → schedule lesson → subject UUID → candidate homework → student correction → optional confirmation → shared homework`.

Низкая confidence:
не создавать official homework.

Добавить:
- /start identity binding;
- safe join code;
- group resolver;
- lesson resolver;
- candidate state;
- confirmation state;
- duplicate protection.

## AI

Каждый ответ/план имеет:
`source = ai | rule_engine | cached_stale`.

Не показывать stale как fresh AI.

---

# 6. Pass 19 — Materials / media

Unified asset contract:

`metadata → authorization → storage object → viewer`.

Поддержка:
- PDF;
- DOCX;
- image;
- HTML;
- original/download.

Проверять отдельно:
1. metadata;
2. DB file row;
3. B2 object;
4. permission;
5. presigned URL;
6. viewer.

Не считать `200 metadata` доказательством доступности файла.

---

# 7. Pass 20 — Cache / failure semantics

Все cached/fallback endpoints разделить:

### Public/stale-safe
Можно stale fallback.

### User scoped
Cache key:
`user + group + subject + endpoint + params + context_version`.

### Mutation
Никакого stale success.

Ошибки:
- 200 empty = реальных данных нет;
- 403 = нет доступа;
- 409 = нужен/изменился context;
- 422 = invalid entity/context;
- 503 = dependency unavailable.

---

# 8. Pass 21 — Admin integration

Админка не должна быть отдельным миром.

Главные разделы:
1. Dashboard
2. Academic structure
3. Content
4. Moderation
5. Integrations
6. Import/validation
7. System

Каждый объект открывается через canonical entity UUID.

Question editor, test editor, report center и import validator должны видеть одну и ту же content entity.

---

# 9. Pass 22 — Deployment / runtime

Release доказательства:

### GitHub
- Code Check green;
- duplicate routes;
- route shadowing;
- typecheck;
- lint;
- backend syntax;
- package consistency.

### Vercel
- READY;
- exact Git SHA;
- frontend fingerprint.

### SpaceWeb
- exact backend commit/build marker;
- /health;
- /ping;
- /auth/me;
- login;
- protected endpoint;
- media.

Router TypeError проверяется только через совпадение deployed artifact/source.
Type hint не ослаблять.

---

# 10. Pass 23 — Full E2E

Создать отдельный disposable E2E dataset.

Сценарий:

`login
→ choose group
→ schedule
→ choose subject
→ attendance
→ homework
→ completion
→ submission
→ test
→ preparation
→ progress
→ SRS
→ community
→ report
→ admin review
→ edit
→ validation
→ publish
→ student sees result`

Дополнительно:
- reload;
- duplicate click;
- retry;
- back/forward;
- expired token;
- switch group;
- switch subject;
- unavailable storage;
- empty data;
- forbidden foreign UUID.

После теста dataset удаляется.

---

# 11. Pass 24 — Mobile / performance

Только после semantic E2E.

Проверить:
- iPhone Safari;
- Android Chrome;
- Windows Chrome/Edge;
- Firefox;
- Yandex;
- macOS Safari/Chrome.

Особенно:
- black/dark overflow area;
- admin pagination;
- test preparation;
- trainers;
- materials;
- schedule month overlap;
- answer/preparation delay;
- loading subject.

---

# 12. Pass 25 — Content synchronization

Отдельный immutable audit:

curriculum
→ subjects/modules/topics
→ source documents
→ materials
→ trainer cards
→ tests
→ questions
→ tickets
→ reports.

Для histology:
- `subject_slug=histology`;
- `specialty_slug=mbh`;
- electronogram mode;
- 28 EM;
- ticket banks untouched;
- other subjects untouched.

---

# 13. Pass 26 — Final release audit

Проверяется не наличие endpoint, а полный lifecycle.

Для каждой функции:

`identity → context → entity → authorization → action → persistence → state transition → reload → recovery → moderation/audit → mobile`.

Статусы:
- DONE;
- PARTIAL;
- BLOCKED;
- DEGRADED;
- NOT STARTED.

Нельзя ставить DONE только за наличие UI/API.

---

# 14. Immediate execution order

Не делать все параллельно.

### Сейчас
**A. Context**
- расширить resolver;
- убрать остатки slug-only;
- UUID planner;
- UUID practice;
- UUID SRS;
- UUID progress.

### Затем
**B. Core lifecycle**
- schedule;
- attendance;
- homework;
- tests;
- preparation;
- progress.

### Затем
**C. Trust**
- reports;
- unified question entity;
- versioning;
- validation/publish.

### Затем
**D. Student**
- community;
- comments;
- notes;
- favorites.

### Затем
**E. Automation**
- Telegram;
- AI;
- SRS E2E.

### Затем
**F. Media**
- materials/viewers/B2.

### Затем
**G. Release**
- CI;
- Vercel;
- SpaceWeb;
- disposable E2E;
- mobile.

---

# 15. Hard gates

Нельзя переходить дальше, если:

### Context gate
Есть slug-only identity для учебной сущности.

### Security gate
Foreign UUID можно прочитать/изменить.

### State gate
Terminal state можно повторно изменить.

### Persistence gate
UI показывает success, но backend не сохраняет.

### Fallback gate
DB error превращается в fake empty 200.

### Deployment gate
Frontend/backend artifacts не совпадают.

### E2E gate
Реальный student flow не проходит от identity до result.

---

# 16. Current status after Pass 9–13

Уже реализовано:
- AcademicContext foundation;
- homework group enforcement;
- progress access;
- preparation/test state gates;
- file group authorization;
- community group scope;
- user-scoped API cache;
- SRS subject UUID;
- Vercel/SpaceWeb build marker;
- /tests redirect regression fix;
- homework optimistic-state fix.

Следующий фактический проход: **Pass 14 — расширение AcademicContextResolver + миграция planner/schedule/progress/practice на единый context contract.**

No destructive production data migration is allowed during these passes unless separately validated and explicitly required.
