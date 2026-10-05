# MEDBIOHIM — SITE-WIDE HIDDEN GAPS AUDIT / 2026-10-06

Цель: продолжение двухпроходного аудита всего сайта. Ищутся не только отсутствующие endpoints, а семантические разрывы: UI → контекст → API → БД → lifecycle → результат → recovery → admin.

## Pass 1 — inventory / cross-layer consistency

### P0 — production/auth
1. Auth remains a release gate. Code contains register/login/me/refresh and the previous getPreferences fix, but target SpaceWeb runtime must still be proven after the recent router regression.
2. Production acceptance must be tied to the same commit for frontend + backend; otherwise a fixed source tree can coexist with an older deployed runtime.

### P0 — reports / complaints
The report button exists in normal tests, preparation, bank and practice, and the admin problem center exists.

Hidden semantic gap:
- report stores question_id/category/message/reporter/status/work_id;
- it does not preserve the exact test/session/context/question/options/selected answer that the student saw.

Therefore an admin may receive “wrong answer” without enough evidence to reproduce the student's state.

Required report snapshot:
- test_id/test title;
- preparation session id and mode;
- question position;
- question text snapshot;
- options snapshot;
- selected answer / free answer;
- correctness state;
- subject/module/topic;
- user/group;
- created_at.

### P0 — report lifecycle
Current admin UI can create a work item, update report status and edit the question. But these operations are not one transactional lifecycle.
Risk: report → fixed can happen without proving work → edit → validate → publish → resolved.
Required state machine: new → reviewing → work → fixed_pending_validation → published/resolved, or rejected with reason.
Also add internal admin comments, assignee, priority/SLA, change history and student-visible resolution status/notification.

### P1 — admin information architecture
Admin has grown into a mixed CMS/DB/system console. Current home combines schedule, subjects, groups, users/roles, content, homework/media, tickets, lectures, imports/tools and complaints/work items.
New IA should separate: Dashboard; Academic structure; Content; Moderation; Integrations; Imports/validation; System/diagnostics.
Raw DB editor must be clearly marked as a dangerous system tool, not normal content editing.

### P1 — broken semantic navigation
src/app/admin/page.tsx links “Банк вопросов тестов” to /tests. next.config.ts redirects /tests to /subjects.
So the admin shortcut does not open the intended test bank despite both pieces of code being individually valid.
Acceptance: every admin quick link must resolve to the intended destination, not merely return HTTP 200.

### P1 — tests / preparation
Test/preparation acceptance must verify every entry path: direct test; bank; preparation full; preparation count; preparation sequential; resume; finish; result; report; admin edit.
The /tests redirect conflict is especially dangerous because it can hide the problem from code-level endpoint checks.

### P1 — community moderation
Student community posting exists and admin can hide/pin/delete posts.
Missing student-facing safety lifecycle: report a post; edit own post; delete own post; moderation reason/status; visible moderation feedback.
If community is a student-generated-content area, create + admin delete is incomplete.

### P1 — settings / OAuth providers
Settings contains fallback provider definitions for Google, VK and Telegram marked enabled/linkable.
Risk: if backend does not return providers_available, frontend can display providers as available even when the actual provider is not configured.
Acceptance: provider buttons must be driven by verified backend/provider availability, not optimistic frontend defaults. A failed linking attempt needs a clear recovery state.

### P1 — duplicate subject slugs
Live DB currently has duplicate active subject slugs: informatics ×3; physiology ×3; chemistry_organic_physical ×3; optics ×2; philosophy ×2; biology ×2; mathematical_analysis ×2; histology ×2; history ×2.
Therefore slug is not a globally unique subject identity.
Rule: UI/API must resolve subject by stable UUID plus course/semester/group context; slug can be a display/routing hint only.
Services that do slug=eq...&limit=1 are unsafe where semester matters. This is especially relevant to SRS and subject-scoped content APIs.

### P1 — generic material delivery
Current live integrity check shows no published materials that are completely empty and no known missing active file links in the validated set.
The remaining product gap is delivery semantics: generic materials, DOCX/PDF/image, HTML mirror and original file need one unified viewer contract, including the physical-storage-unavailable state.

### P1 — homework
Homework has group scope, due date, completion, submission, file upload and grading backend.
Required explicit states: draft → submitted → graded/returned.
The UI exposes “Сдать работу” even when an item is already done. The DB has UNIQUE(homework_id,user_id), so resubmission semantics must be explicit rather than implicit.

### P1 — progress
Progress correctly hides numeric cards in degraded mode.
Remaining acceptance: a test attempt, completed preparation, homework completion/submission and grade must each change the expected progress values. A valid-looking progress page is not enough; activity-to-progress E2E is required.

### P1 — schedule
Schedule has group-aware data and active-version integrity.
Acceptance still needs: one pair split by a break remains one logical lesson; alternating pairs; week/month/semester views; cancelled/makeup state; attendance; homework linkage; subject colors; mobile agenda; refresh after schedule version replacement.

### P1 — search
Search exists, but acceptance must verify result identity: subject UUID, material UUID, question UUID, test UUID and lecture UUID. A result must never navigate by an ambiguous subject slug alone.

### P1 — questions/content
Live DB currently has 195 questions not linked to test_questions. This is not automatically corruption because some questions are intended for other banks/practice.
Validator must distinguish intentionally standalone, test-linked, archived, unpublished and unintentionally orphaned rows. Do not auto-delete or relink based only on absence from test_questions.

### P2 — generic learning_sessions
Generic learning_sessions storage/API exists but active frontend flows use dedicated preparation/training paths. Keep deferred until all external consumers are checked.

### P2 — version history
Audit log + rollback exists. Still missing polished entity-level history: who changed what; before/after diff; reason; restore preview; restore confirmation; relation to complaint/work item.

## Pass 2 — scenario walk

### Student: “I found an error in question”
Expected: question → report → snapshot → admin queue → work → edit → validate → publish → student sees resolution.
Current: UI/API/admin queue exist, but context snapshot and complete lifecycle are missing.

### Student: “I open tests from admin”
Expected: Admin → Test bank.
Current: admin shortcut /tests → Next redirect /subjects. This is a real product navigation defect.

### Student: “I create a community post”
Expected: post → group → visible feed → report/moderation → resolution.
Current: create/feed/admin moderation exist; student report/edit/delete lifecycle is incomplete.

### Student: “I connect Telegram/VK”
Expected: settings → verified provider availability → OAuth → callback → linked identity → recoverable failure.
Current: provider UI has optimistic fallback entries. Runtime provider availability is external and must be authoritative.

### Student: “I open a subject”
Expected: current course/semester/group → stable subject UUID → plan/materials/tests/tickets/progress.
Risk: duplicate slugs make slug-only resolution unsafe.

### Student: “I submit homework twice”
Expected: explicit replace submission / resubmit semantics.
Current: DB prevents duplicate rows, but UI semantics need to be explicit.

### Student: “Progress says 0”
Expected: either real 0 or clear degraded state.
Current degraded handling exists; activity-based E2E still needs proof.

## Global Definition of Done
A feature is not DONE because a button, route or table exists.
Required: UI; correct context; API; persistence; authorization; RLS; lifecycle; success feedback; error/retry; duplicate/reload safety; mobile state; admin/moderation path where applicable; E2E proof in target environment.

## Priority after this audit
### P0
- auth/router/production stability;
- authenticated smoke;
- report context snapshot;
- report lifecycle with validation/publish;
- same-commit frontend/backend deployment proof.

### P1
- admin IA redesign;
- fix admin /tests navigation conflict;
- provider availability truth;
- duplicate-slug-safe subject resolution;
- community moderation lifecycle;
- homework resubmission semantics;
- test/preparation full entry-path smoke;
- progress activity E2E;
- unified materials viewer contract.

### P2
- entity version history UI;
- bulk content validation;
- route consolidation;
- generic learning_sessions cleanup;
- analytics/polish.

## Do not touch
- existing ticket-bank metadata without a source-backed requirement;
- intentionally standalone questions;
- unused indexes solely because Supabase reports them as unused;
- empty activity tables as demo data.

# Pass 3 — semantic audit of additional functions / live-state cross-check

Этот проход специально не повторяет предыдущие P0/P1, а ищет функции, которые технически существуют, но нарушают ожидаемую модель продукта.

## P0/P1 — Community: потерян академический контекст

Клиент создаёт пост только с title/body. Backend `SupabaseAcademic::createCommunityPost()` сохраняет post без `group_id`, а чтение `communityPosts()` также не фильтрует по группе.

При этом схема и RLS уже предполагают group-scoped community.

Это создаёт разрыв:
`student → current group → community` не используется.

Нужно:
- передавать/определять текущую активную группу;
- выдавать посты только своей группе + явно глобальные посты;
- показывать автора;
- не полагаться на глобальную ленту для учебной группы;
- отдельным правилом разрешить модераторам/админам глобальные публикации.

## P1 — Community: автор фактически теряется в UI

`SupabaseAcademic::communityPosts()` выбирает только author_id, title/body/date, без профиля автора.
Frontend ожидает author_name/author и иначе показывает «Студент».

То есть функция публикации работает, но социальная идентичность поста потеряна.

Нужно вернуть стабильный author snapshot/display_name либо безопасно присоединять users.

## P1 — Community: comments существуют только как инфраструктура

В БД есть `comments` и RLS-политики для них, но активный frontend community не показывает комментарии и не имеет comment API в найденном пользовательском потоке.

Следовательно «обсуждения» фактически сейчас означают только список постов, а не обсуждение.

Нужно либо:
- довести комментарии до UI/API/moderation;
- либо убрать обещание «обсуждения» до готовности функции.

## P1 — Attendance: студент сам выставляет официальный статус

Frontend вызывает `markAttendance(entryId,status)`, а RLS разрешает authenticated пользователю INSERT/UPDATE/DELETE собственных attendance_records.

Статусы включают `present`, `excused`, `sick`, `unexcused`.

Смысловая проблема: пользователь может самостоятельно выставить себе «уважительная», «болезнь» или «пропуск», а запись выглядит как факт посещаемости.

Нужно разделить:
- `self_report` — студент сообщил о своём статусе;
- `confirmed` — статус подтверждён ответственным лицом;
- при необходимости `teacher/starosta/admin override`.

Иначе посещаемость нельзя считать официальной.

## P1 — Homework: выбор группы для студента не поддерживает несколько групп

В `POST /homeworks` для студента backend выбирает первую активную membership по `ORDER BY created_at LIMIT 1`, игнорируя конкретную группу.

При этом список ДЗ уже поддерживает несколько групп через IN по memberships.

Получается асимметрия:
- чтение — несколько групп;
- создание — только первая.

Нужно передавать выбранный group_id и проверять, что студент состоит в этой группе, либо явно показывать selector при нескольких membership.

## P1 — Homework: completion и submission — две независимые сущности без ясной модели

В UI доступны одновременно:
- «Отметить выполненным»;
- «Сдать работу».

При этом completed хранится в `homework_progress`, а сдача — в `homework_submissions`.

Это позволяет получить состояния:
- выполнено, но не сдано;
- сдано, но не выполнено;
- выполнено после оценки;
- новая сдача после предыдущей.

Нужно определить единую матрицу статусов и правила переходов, иначе прогресс и карточка ДЗ будут расходиться.

## P1 — Progress: backend и UI описывают разные формулы

`ProgressService` вычисляет `overall_pct` прежде всего как среднее процентов `user_subject_progress` по предметам (с fallback на progress_ledger).

Frontend подписывает этот показатель как общий прогресс и текстом утверждает:
«Общий прогресс — среднее по домашним заданиям и тестам».

Это не одна и та же метрика.

Более того, live DB сейчас содержит:
- progress_ledger = 0;
- user_question_states = 0;
- srs_cards = 0;
- homework_submissions = 0;
- test_attempts = 1;
- attendance_records = 0.

Поэтому нужно зафиксировать одну документированную формулу и не показывать пользователю другое объяснение.

## P1 — Progress: расчёт ДЗ не ограничен группами пользователя

`ProgressService` запрашивает все `homeworks` и затем считает submissions пользователя среди них.

В отличие от `HomeworkRepository::listForUser()`, здесь нет фильтра по:
- group_id IS NULL;
- группам пользователя.

Следовательно ДЗ другой группы/чужой группы может попасть в denominator прогресса, если оно существует.

Нужно использовать тот же academic-scope resolver, что и основной список ДЗ.

## P1 — Notes: нет удаления/очистки заметки

API называется upsert, но POST /notes требует непустой body.

Пользователь может создать/изменить заметку, но не может штатно очистить её до пустого состояния.

Нужно:
- DELETE /notes/{id}, или
- upsert с пустым body как удаление,
- плюс UI «Удалить заметку».

## P1 — Favorites: target не валидируется

`favorites/toggle` принимает произвольные `target_type` + `target_id` и не проверяет существование объекта.

Можно технически создать favorite на несуществующий/удалённый объект.

Нужно whitelist типов + existence check либо отдельные FK-механизмы для поддерживаемых сущностей.

## P1 — Practice: выбор предмета использует slug

Practice получает subjects как `subject_slug` и отправляет slug в `listQuestions`.

При текущих duplicate active slugs это может показать не тот предмет/семестр, если backend не добавляет достаточный context filter.

Practice должен работать по UUID subject_id, а slug использовать только для URL/display.

## P1 — Schedule: семестр захардкожен во frontend

`src/app/schedule/page.tsx` содержит `SEMESTER_FROM = 2026-09-01` и `SEMESTER_TO = 2027-01-31`.

После окончания этого семестра UI не переключится автоматически на новый учебный период.

Нужно получать active academic year/session/semester from backend и использовать даты только как fallback.

## P1 — Schedule: timezone захардкожен

Schedule использует `Asia/Vladivostok`.

Для текущего пользователя/учебной группы это соответствует Хабаровску, но для платформы это не универсальная настройка. В будущем timezone должен принадлежать academic context/group/institution, а не компоненту.

## P1 — Learning sessions: backend допускает произвольный status

PATCH /sessions/{id} принимает `status` без явного whitelist в route и затем сохраняет его.

Это опасно для lifecycle, особенно учитывая предыдущую ошибку с недопустимым `cancelled` в preparation sessions.

Нужно:
- enum/whitelist для generic sessions;
- отдельная state machine;
- запрет нелогичных переходов после finished.

## P1 — AI study plan: генерация может быть успешной без LLM, но UI должен явно показывать источник

`AcademicPlanningService::generatePlan()` корректно имеет deterministic fallback `rule_engine`, если LLM недоступен.

Но продуктовый контракт должен различать:
- AI-generated;
- rule-engine generated;
- stale cached plan.

Иначе пользователь может считать deterministic plan результатом LLM.

## P2 — SRS / training activity: наличие таблиц не доказывает пользовательский цикл

Live DB:
- srs_cards = 0;
- user_question_states = 0;
- trainer_feed_answers = 23;
- trainer_feed_cards = 206.

Это не ошибка само по себе. Но acceptance должен доказать:
open card → answer/skip → state update → next card → due scheduling → progress.

Наличие 23 trainer answers доказывает только сохранение ответов, а не завершённый spaced-repetition цикл.

## P2 — AI chat: данные есть, но нет доказательства пользовательского lifecycle

Live DB содержит 2 ai_conversations и 2 ai_messages.

Нужно E2E:
provider availability → conversation → message → assistant response → retry/failure → history → provider switch.

Особенно важно, потому что ранее были реальные ошибки Groq/GigaChat/Gemini/Mistral/OpenRouter.

## Live-state correction

Предыдущий текст этого документа говорил о 195 опубликованных unlinked questions. После текущей проверки это уже неактуально.

Сейчас:
- всего unlinked questions = 195;
- опубликованных и активных unlinked = 0;
- все 195 — unpublished;
- из них 77 archived;
- broken test_question links = 0.

Следовательно это не текущий release blocker и должно классифицироваться как content inventory, а не production corruption.

## Live-state additional facts

- community_posts = 0;
- comments = 0;
- favorites = 0;
- notes = 0;
- trainer_feed_cards = 206;
- trainer_feed_answers = 23;
- srs_cards = 0;
- ai_conversations = 2;
- ai_messages = 2;
- progress_ledger = 0;
- student_academic_states = 37;
- subject_gradebook_entries = 77;
- question_reports = 0;
- homework_submissions = 0;
- test_attempts = 1;
- attendance_records = 0.

Пустые activity tables не считать автоматически сломанными: они требуют E2E-проверки, а не заполнения демо-данными.

# Updated priority

### P0
- auth/router/runtime;
- report context + full lifecycle;
- production same-commit proof.

### P1
- community group scoping + author identity + comments lifecycle;
- attendance self-report vs confirmed status;
- multi-group homework creation;
- homework completion/submission state machine;
- progress formula + group scope;
- notes deletion;
- favorite target validation;
- practice subject UUID;
- schedule dynamic academic session/timezone;
- generic session state machine;
- AI plan source labeling.

### P2
- SRS full lifecycle;
- AI chat E2E;
- entity version history;
- bulk validation/analytics.


# Pass 4–5 reference

The next independent semantic/code-contract passes are recorded in `docs/SEMANTIC-CODE-AUDIT-2026-10-06-PASS4-5.md`.

Important correction: the earlier attendance wording must not be interpreted as “student cannot set own status”. Student self-report is required by the student-first architecture. The remaining gap is provenance/confirmation for treating that self-report as an official group/academic fact.

Additional code-contract findings from Pass 5: production build currently ignores TypeScript/ESLint errors; Router uses first-match semantics and therefore needs shadowing/order detection; homework/community fallback paths can diverge semantically from primary paths; planner/SRS still have subject-name/slug identity risks; runtime build fingerprint must be verified against the deployed artifact.
