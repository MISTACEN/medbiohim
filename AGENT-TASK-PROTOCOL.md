# MEDBIOHIM — protocol for agent tasks

## 1. Task Brief
Coordinator issues a self-contained brief:
- Goal and user-facing outcome.
- Acceptance criteria and explicit non-goals.
- Base `main` SHA and relevant current files.
- Assigned agent/subagent and exact writable file list.
- Read-only dependencies and API/DB contracts.
- Security/data risk class and required approvals.
- Tests/checks and expected report format.
- Workspace identifier and patch destination.

## 2. Parallelization
Safe to parallelize: independent read-only audits; UI and Worker work after API contract is frozen; subject content work on disjoint source files; independent QA review. This applies to every team mode, including S0/S1/M1/M2/H: each participant must own a distinct task and deliverable, not merely a different copy of the same task.
Not safe to parallelize: same task or overlapping deliverables; same file/resource; shared types/route registry/package lock; overlapping migrations; edits to shared content index; changes that require coordinated schema+API rollout without an agreed contract.

Before launch, coordinator creates a workstream ownership map. Every writable path/resource has exactly one owner for that task. Shared contracts are agreed first and then treated as read-only dependencies by other workstreams. If boundaries cannot be made disjoint, assign one owner and sequence the work; do not force parallel execution.

## 3. Workspace rules
- Each implementer uses a separate worktree/container/patch workspace based on the same recorded SHA.
- No two agents write into the same checkout. No subagent pushes or commits to shared main.
- Every write must be inside assigned paths. Unlisted paths are read-only.
- If task expands, pause and request coordinator reassignment.
- No branch creation by default; user preference is direct main integration. Temporary isolated workspace is not a long-lived branch.

## 4. Patch handoff
Agent returns:
1. Base SHA and final diff.
2. Exact changed paths.
3. Summary of behavior and compatibility.
4. Commands run and pass/fail results.
5. Tests added and evidence.
6. Security/privacy review.
7. Known limitations, migration/deploy requirements.
8. Explicit statement that no production action was taken.

## 5. Integration
Coordinator checks current main HEAD. If HEAD differs from patch base, inspect intervening commits and rebase/rebuild patch; never force. Integrate one patch at a time, review diff, run checks, then next patch. If conflicts affect semantics, return to owner rather than guessing. Commit only authorized scope to main with expected-head/fast-forward protection.

## 6. Gates
- Gate A: ownership, scope and contract agreed.
- Gate B: implementation checks pass.
- Gate C: independent QA/Security review.
- Gate D: integration and regression checks pass.
- Gate E: production deployment/smoke only after explicit approval.

Critical/high security issue, failing required test, unreviewed migration, secret leak or unexpected file modification blocks integration.

## 7. Data and production safety
No destructive SQL, mass import, storage deletion, secret rotation, binding/DNS change, production deploy or rollback without separate explicit authorization. Use synthetic/test accounts. Never paste credentials or PII into agent prompts, commits or reports.

## 8. Final report
Report in Russian: completed changes, commit SHA if any, exact files, checks and results, unrun checks, risks and next blocker. Distinguish code presence, deployment, and production acceptance.

## 2A. Выбор режима команды
Координатор сначала оценивает число независимых workstream, а не пытается заполнить все доступные слоты агентами:
- Один файл/один слой/простая правка → S0: один агент без субагентов.
- Одна область с 2 независимыми подпакетами → S1: один ведущий + до двух субагентов.
- Два независимых слоя с разными файлами и контрактами → M1: два ведущих без субагентов.
- Два больших workstream, каждый можно безопасно разделить на два независимых подпакета → M2: два ведущих + до двух субагентов у каждого.
- Неравномерная задача → H: разное число субагентов у разных ведущих.
- Если работа зависит от одного общего файла, миграции или незакреплённого API-контракта, сначала последовательно согласовать этот общий элемент; не создавать искусственный параллелизм.

Ведущий агент отвечает за качество и интеграцию patches своих субагентов. Координатор отвечает за границы между ведущими, общий контракт и интеграцию верхнего уровня. Субагент не получает задачу «помогай вообще»: у него должны быть отдельный deliverable, ограниченный список файлов и критерии приёмки.
