# MODULAR_MIGRATION_LOG

Хронология модульной миграции MEDBIOHIM.

## 2026-11-06 — независимая проверка и стабилизация (GLM-проход)

- Base commit: `8524a1f1` (`docs: document target modular architecture`).
- Рабочее дерево содержало незакоммиченную реализацию этапов B–H предыдущего прохода. Всё перепроверено по коду и тестам, дополнено документами состояния, закоммичено логическими блоками.
- Проверки (все exit code 0):
  - `npm run typecheck`
  - `npm run lint` (0 errors, 61 унаследованных warning)
  - `npm run test:unit` — 519 pass / 0 fail (vitest, 43 файла)
  - `npm test` — 341 pass / 0 fail (node --test)
  - `cd workers/api && npm run check` — 341 pass / 0 fail
  - `npm run build` — success
- Зафиксированные артефакты:
  - Shared: src/components/ui, src/components/questions, src/lib/question-types, src/shared/{permissions,file-engine}, реестр docs/architecture/registry/components.json.
  - Права: workers/api/src/lib/{permissions,teacher-scope,content-access}.ts, правки admin/groups/subjects/admin-schedule/admin-attestations/admin-parity/submissions, Sidebar/AdminGate/AdminNav.
  - Teacher Workspace: workers/api/src/routes/teacher.ts (+mount /api/v1/teacher), src/app/teacher, src/app/admin/teachers, src/lib/api/teacher.ts.
  - Миграция: supabase/migrations/20261105090000_teacher_assignments.sql (аддитивная, RLS, fail-closed в Worker).
  - E2E: e2e/roles.spec.ts (требует тестовых аккаунтов), обновлён e2e/smoke.spec.ts.
- Добавлены документы состояния: MODULAR_MIGRATION_{STATUS,MAP,BACKLOG,LOG,HANDOFF}.md.
- Ограничения: production не деплоился, миграция к БД не применялась, живые RLS не проверялись — см. BACKLOG.

## 2026-11-05 — аудит shared-слоя (DeepSeek-проход)

- docs/architecture/SHARED-LAYER-AUDIT-2026-11-05.md — аудит по коммиту `8524a1f1`.
- Этапы A (реестр как данные) и B (типы вопросов) выполнены; этап C — для экранов прохождения.
