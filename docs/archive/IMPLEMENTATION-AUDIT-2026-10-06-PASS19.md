# IMPLEMENTATION AUDIT — 2026-10-06 — PASS 19

## Цель

End-to-end проверка прогресса, истории попыток и контракта test/preparation после Pass 18.

## Найдено и исправлено

### 1. Preparation history was still reading mutable questions

backend/config/routes/preparation.php:
- GET preparation теперь строит вопросы из test_preparation_sessions.question_snapshot;
- правильные ответы и correct flags не выдаются до завершения;
- после завершения эталоны берутся из snapshot;
- finish больше не JOIN-ит текущую questions;
- topic/module metadata берётся из snapshot;
- AI review больше не JOIN-ит текущую questions; использует session snapshot + test_preparation_results.answer_snapshot.

Это закрывает drift: изменение/удаление текущего вопроса после начала подготовки не меняет исторический результат.

### 2. Preparation answer snapshot

Проверено, что PATCH записывает answer_text, is_correct, score и answer_snapshot.

Live invariant: результатов без answer_snapshot — 0.

### 3. Progress counted the wrong terminal status

test_attempts использует in_progress, submitted, abandoned.
/api/v1/progress ранее считал завершёнными только finished/completed.
Исправлено: submitted теперь является завершённой попыткой.

### 4. Progress silently converted DB failure into empty history

Удалён silent fallback: ошибка TestRepository::attemptsForUser() больше не превращается в items=[] и HTTP 200; ошибка поднимается в общий 503 DB_UNAVAILABLE.

### 5. Test history cross-group ambiguity

TestRepository::attemptsForUser() теперь при group context требует test_attempts.group_id = selected_group_id.
Нельзя восстановить принадлежность старой попытки к группе только через subject/schedule, потому что один subject может существовать в нескольких группах.

### 6. Frontend group propagation

Исправлено:
- src/app/tests/bank/[id]/page.tsx → getTest(..., groupId) + getBankProgress(..., groupId);
- src/app/tests/preparation/[id]/page.tsx → getBankProgress(..., groupId).

## Live Supabase verification

Проверено после изменений:
- active attempts without group: 0
- active preparations without group: 0
- active preparations without academic session: 0
- active preparations without question snapshot: 0
- preparation results without answer snapshot: 0

Есть 1 старый submitted test attempt без group_id, созданный 2026-10-02 до введения контекстного snapshot. Он не был автоматически приписан к группе: текущая membership не является достаточным доказательством исторической принадлежности. Такая legacy-запись намеренно исключается из group-scoped history вместо потенциального cross-group pollution.

## Remaining verification

- PHP syntax must be checked in the actual repository/deployment environment.
- Next.js TypeScript/build must be rerun after Pass 19.
- SpaceWeb runtime smoke remains required.
- Latest GitHub commit does not currently have a workflow result exposed by the connected workflow query.

## Next pass

Pass 20:
1. contract audit of all test/preparation frontend consumers;
2. verify no stale answer, score, correct, finished assumptions;
3. inspect history/progress UI against new server semantics;
4. then target-environment PHP/Next smoke.