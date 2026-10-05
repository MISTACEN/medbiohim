# MEDBIOHIM — state-machine / idempotency audit / Pass 7 / 2026-10-06

Цель: проверить переходы состояний, повторные запросы, reload/back-forward, гонки и возможность записать состояние вне допустимого workflow.

## P0 — Homework progress route не проверяет доступ к homework
POST /homeworks/{id}/progress принимает любой homework UUID и пишет `(homework_id,user_id)` без проверки существования homework, group membership, global/group visibility или academic context.
Это тот же класс проблемы, что submit: RLS может быть обойдён server-side backend credentials.

## P0 — Test preparation PATCH позволяет ответить на вопрос вне session
PATCH /tests/preparation/{id} получает question_id из клиента и проверяет только наличие вопроса в public.questions. Нет проверки, что question_id входит в session.question_ids.
Следствие: можно записать result для произвольного вопроса в своей preparation session, ломая total/answered, score, topic statistics и bank progress.
Target: question_id должен принадлежать session.question_ids.

## P0 — Preparation finish не является строгим state transition
POST /tests/preparation/{id}/finish не проверяет, что session.status = in_progress; terminal session может быть завершена повторно.
Нужен state machine: in_progress → completed; terminal state нельзя повторно завершать.

## P0 — Preparation/test start может принять unpublished test
resolveTestId() находит test по id/source_key, но start не проверяет tests.is_published = true. GET test detail и POST /tests/{id}/start также используют findById без явной publication gate.
Student contract должен разрешать только published tests.

## P1 — обычный test attempt не idempotent
TestRepository::startAttempt() всегда INSERTs новый test_attempts row. Double tap/network retry может создать несколько in_progress attempts для одного user/test.
Нужен active-attempt invariant + transaction/locking + retry-safe response.

## P1 — обычный test finish допускает повторное завершение
finishAttempt() обновляет строку независимо от текущего status. Terminal attempt можно повторно отправить с другим score/max_score и перезаписать результат.
Target: in_progress → submitted only once; identical retry idempotent, conflicting retry rejected.

## P1 — Homework UI optimistic state bug
src/app/homework/page.tsx после setHomeworkDone() обновляет my_status, но status() вычисляет состояние только из my_completed, submission_status и due_date. my_status не учитывается.
Следствие: backend может успешно сохранить Done, но UI локально остаётся pending до reload.

## P1 — Homework submit UI creates upload before submit
При выборе файла upload происходит немедленно, до подтверждения submit. Отмена/закрытие оставляет потенциально orphan file.
Нужен draft upload/cleanup или атомарная submit semantics.

## P1 — Homework progress и submission — две независимые state machines
homework_progress.completed и homework_submissions.status могут расходиться: completed без submission, submitted без completed, graded без completed и т.д.
Нужен canonical/derived state contract для UI, Planner и Progress.

## P1 — Preparation answer correctness mutable
Result upsert позволяет менять ответ и correctness, что допустимо для editable preparation, но backend должен гарантировать ownership session, session in_progress и question membership. Последний пункт сейчас отсутствует.

## P1 — Preparation current_index не связан с session.question_ids
Client может передать произвольный current_index. Нижняя граница проверяется, верхняя — нет. Нужен clamp 0..count(question_ids).

## P2 — Test attempt score client-trusted
finishAttempt() принимает score и max_score от клиента и сохраняет их. Для authoritative result сервер должен пересчитывать score из stored answers или явно маркировать client-calculated result.

## P2 — Error semantics
State errors должны иметь отдельные codes: ALREADY_COMPLETED, INVALID_TRANSITION, QUESTION_NOT_IN_SESSION, TEST_NOT_PUBLISHED, ATTEMPT_ALREADY_ACTIVE, HOMEWORK_NOT_ACCESSIBLE.

# Pass 7 invariant
Для каждой mutable entity: owner/context check; allowed current state; allowed next state; idempotency/retry; duplicate-click; reload/reconnect; terminal-state protection; server-authoritative fields; canonical state used by UI and progress.

# Priority
P0: homework progress authorization; preparation question membership; preparation terminal-state protection; published-test gate.
P1: test-attempt idempotency; finish-attempt terminal protection; homework optimistic-state bug; upload/submit orphan files; progress/submission reconciliation.
P2: server-authoritative test score; granular state error codes.