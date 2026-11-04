# MEDBIOHIM — протокол задач, патчей и интеграции агентов

## 1. Жизненный цикл

`Planned → Assigned → In progress → Ready for review → Integrated → Verified`.

- **Ready for review** — агент закончил свою изолированную часть, но она ещё не объединена.
- **Integrated** — patch последовательно применён в integration workspace.
- **Verified** — релевантные проверки пройдены и diff принят.
- Deployment и production acceptance — отдельные статусы, не подразумеваются `Verified`.

## 2. Самодостаточное задание

Каждый верхнеуровневый агент получает собственный brief:
1. **Base** — точный commit SHA и подтверждение чистой рабочей копии.
2. **Цель** — конкретный пользовательский результат и приоритет.
3. **Контекст** — архитектура и нужные факты/ссылки.
4. **Allowlist** — точные файлы/каталоги, которые разрешено менять.
5. **Read-only paths** — что можно изучать, но нельзя редактировать.
6. **Запреты** — чужие зоны, secrets, live DB, deploy, destructive operations.
7. **Dependencies/contracts** — endpoint, schema, auth/RLS, storage keys, error semantics.
8. **Acceptance criteria** — проверяемые условия результата.
9. **Checks** — реальные команды из package scripts и целевые сценарии.
10. **Output** — patch/diff, список файлов, результаты и ограничения.

Brief не должен ссылаться на «то, что сделал другой агент» или требовать связи с ним.

## 3. Изоляция рабочих пространств

- Каждый верхнеуровневый агент работает в собственной копии репозитория или отдельном local git worktree от одного base SHA.
- Нельзя открывать один writable directory в двух агентах.
- Не создавать постоянные remote branches/PR для каждой подзадачи. Предпочтительный артефакт — unified diff (`git diff --binary`) плюс отчёт; при необходимости — локальный commit в изолированной копии без push.
- Не использовать force push, reset с потерей чужой работы или checkout поверх изменений.
- Перед выдачей patch агент проверяет `git status`, `git diff --check`, `git diff --stat` и перечень изменённых файлов.

## 4. Независимость двух агентов

Два ZCode-агента не общаются и не знают о существовании друг друга. Координатор:
- выдаёт им независимые задания;
- получает артефакты раздельно;
- после обоих результатов назначает одного агента на отдельную задачу интеграции;
- передаёт интегратору обезличенный patch, не диалог другого агента.

Если host поддерживает внутренние subagents, они работают только внутри workspace своего родителя. Они не заменяют координатора и не связываются с другим верхнеуровневым агентом.

## 5. Последовательная интеграция

1. Координатор сверяет base SHA и changed paths обоих patch.
2. Проверяет, что файлы не пересекаются. Если пересекаются — не применять автоматически; назначить одного владельца на конфликтный файл.
3. Выбирает одного интегратора и выдаёт отдельный brief с обоими patch artifacts, актуальным base и правилами.
4. Интегратор применяет patch A и patch B по очереди в чистой integration workspace. После каждого шага проверяет diff и состояние дерева.
5. При conflict сохраняет оба варианта, не выбирает вслепую ours/theirs, формулирует точку расхождения и ждёт решения координатора.
6. QA/Security делает read-only review интегрированного diff.
7. После checks maintainer решает, разрешён ли commit непосредственно в `main`. До этого интеграционный patch не пушится.

## 6. Контракт межслойной задачи

До параллельной реализации координатор фиксирует:
- route + method + query/path params;
- request/response schema и nullable fields;
- HTTP status/error codes;
- auth transport и authorization rule;
- owner/group scope и RLS policy;
- pagination/sort/filter;
- cache/TTL/invalidation;
- binary/media MIME, visibility, signed URL;
- migration/RPC signature и rollout order;
- backward compatibility и tests.

Если contract меняется, сначала обновляется `API-CONTRACTS.md`, затем слои реализуются отдельными patch. Если contract неизвестен — сначала read-only audit, а не параллельная реализация на догадках.

## 7. Конфликты и блокеры

- Любой выход за allowlist — остановка и запрос координатору.
- Неожиданный diff в чужой зоне не удалять; сохранить и сообщить.
- Конфликт одного файла решается одним назначенным writer; другой только ревьюит.
- Если base `main` изменился, интегратор не перезаписывает HEAD. Координатор обновляет base, повторно проверяет patch applicability и при необходимости запрашивает новый patch.
- Не скрывать failing tests и не ослаблять тесты только для зелёного статуса.

## 8. Секреты и данные

- Не помещать secrets в prompt, source, patch, commit message, screenshot или отчёт.
- `.env.example` допустим только с placeholder; реальные `.env*` запрещены.
- Не выгружать student/user rows. Для тестов — synthetic fixtures; live schema/ledger inspection только с явным разрешением и read-only режимом.
- Не выполнять production migration, SQL writes, reset, destructive cleanup, массовый import, object upload/delete, secret rotation, deploy или DNS/binding change без отдельного разрешения.
- Service-role key не использовать в browser/frontend; предпочитай RLS и user-scoped client.
- При обнаружении PII/secret прекрати обработку, не цитируй значение, сообщи координатору безопасным описанием.

## 9. Формат отчёта агента

```text
Status: Ready for review | Blocked
Base SHA:
Changed files:
Summary:
Contracts changed:
Commands executed:
Results:
Not run / not verified:
Risks and follow-ups:
Patch artifact:
```

Указывай фактические коды выхода и краткий вывод. Не называй не запущенную команду успешной.

## 10. Отдельный отчёт интегратора

```text
Base SHA:
Patch artifacts received:
Applied order:
Conflicts:
Final changed files:
git diff --check:
Tests and results:
QA/Security findings:
Ready for maintainer approval: yes/no
Commit/push/deploy: not performed unless explicitly authorized
```
