# Исторические source-mutating workflows (retired 2026-10-27)

Волна 0, задача A4 из [TECH-AUDIT-PLAN-2026-10-27.md](../TECH-AUDIT-PLAN-2026-10-27.md):
15 workflow-файлов имели `permissions: contents: write` и выполняли `git push origin HEAD:main`
по `workflow_dispatch`. Они писали исходники в `main` мимо pull request и мимо `code-check`,
то есть любые изменения могли попасть в прод-ветку без ревью и без проверок.

Файлы удалены из `.github/workflows/`. Ни один оставшийся workflow, скрипт или
`package.json` на них не ссылался (проверено grep'ом перед удалением).

## Как восстановить

Любой файл достаётся из Git-истории без потери содержимого:

```bash
git show 7d937c12:.github/workflows/apply-p0-v2.yml
git checkout 7d937c12 -- .github/workflows/apply-p0-v2.yml   # если файл правда нужен
```

Последний коммит, содержавший все 15 файлов: **`7d937c12` (2026-10-21)**.

## Почему удаление безопасно

Каждый workflow был написан идемпотентно: перед патчем он проверял наличие строки-маркера
(`if '…' in t`) и пропускал вставку, если код уже есть. Перед удалением все маркеры были
проверены по текущему дереву — **у всех 15 файлов 0 отсутствующих маркеров**, то есть их
патчи уже применены в `main` и повторный запуск был бы no-op. Сами сниппеты, на которые они
опирались, остаются в `scripts/p0/` и в Git-истории как справочный материал.

## Список удалённых workflow

| Workflow | Что делал |
|---|---|
| `apply-admin-database.yml` | писал полный файл admin-database route, восстанавливал questions из старого коммита |
| `apply-db-writes.yml` | внедрял write-обработчики в admin-database route |
| `apply-p0-academic-crud.yml` | CRUD academic + groups/subjects |
| `apply-p0-v2.yml` | внедрял `admin.put("/users/:id/academic")` в admin.ts |
| `apply-p1-ui-schedule-db.yml` | UI расписания + БД-слой |
| `apply-p1-v2.yml` | текстовые патчи home/admin schedule/database |
| `apply-personal-cabinet.yml` | декодировал Base64-пейлоады поверх `dashboard.ts` и `my.ts` |
| `fix-academic-soft.yml` | мягкая обработка ошибок academic |
| `fix-build-typecheck.yml` | правил ошибки typecheck |
| `fix-groups-subjects.yml` | копировал `scripts/p0/groups.source.txt` / `subjects.source.txt` поверх обработчиков |
| `fix-questions-miniquiz.yml` | заменял `workers/api/src/routes/questions.ts` из коммита `c6cefd4b` |
| `fix-runtime-errors.yml` | текстовые патчи рантайм-ошибок |
| `fix-worker-typecheck.yml` | typecheck questions + histology |
| `restore-contract-tests.yml` | восстанавливал тест-файл из `835e5e43` и правил ассерты |
| `restore-schedule-page.yml` | восстанавливал UI расписания из `d534fce` и правил строки |

## Принятое правило

**Изменения исходников — только через commit/PR.** Ни один workflow не должен иметь
`contents: write` вместе с `git push`. Если однажды понадобится повторяемый скрипт-патч,
он оформляется как обычный скрипт в `scripts/` и запускается локально с ревью результата.
