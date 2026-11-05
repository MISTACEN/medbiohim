# MODULAR_MIGRATION_HANDOFF

Передача состояния на 2026-11-06. Base commit: `8524a1f1`. Следующий шаг исполнителя: начать с MODULAR_MIGRATION_BACKLOG.md (п.1 — миграция БД по отдельному разрешению владельца; п.2–3 — код).

## Готово и подтверждено

- **Права и scope (план §10).** Worker: permissions/teacher-scope/content-access + правки admin.ts, groups.ts, subjects.ts, admin-schedule.ts, admin-attestations.ts, admin-parity.ts, submissions.ts. Teacher не имеет admin-поверхностей; группы/каталог/расписание/членство — admin-only; проверка работ идёт по цепочке объектов в области. Тесты: workers/api/test/{permissions,teacher-scope}.test.js.
- **Frontend-навигация.** Admin-консоль видит только admin (Sidebar, AdminGate, AdminNav, lib/admin/access.ts согласованы).
- **Teacher Workspace (этап H).** `/teacher` — обзор, работы, оценка/возврат через scope; admin — `/admin/teachers` (назначения групп/студентов, кандидаты); «Тесты и предпросмотр» (/teacher/preview/[id] — прогон без записи попыток), «Мои лекции» (единый RichLectureEditor через /my-lectures), «Личный банк вопросов» (/my-questions). API: `/api/v1/teacher/*`, GET /tests/preview/:id; чтение — teacher.content.manage, запись назначений — admin.
- **Shared-слой (этапы A–D).** UI kit (Button/Badge/Modal/Tabs/DataTable/ConfirmDialog), AnswerOption + CheckResultPanel, question-types (registry/normalize/grade), реестр компонентов как данные; копии заменены на экранах прохождения и в админ-таблицах.
- **File Engine (этап F).** Встроенный просмотр DOCX/XLSX/PPTX/CSV/TXT/MD/архивов + диспетчер FilePreview, подключён в materials и UserFiles; детекция по сигнатуре/MIME/allowlist, лимиты, XSS-очистка; оригинал — скачивание по правам.
- **Миграция.** `20261105090000_teacher_assignments.sql` — аддитивная, RLS, security-definer хелперы; Worker работает fail-closed до применения.

## Частично

- Teacher Workspace: нет авторского preview-режима теста и единого научного редактора (BACKLOG п.2–3).
- Регрессия: автотесты зелёные, e2e-роли не прогонялись (нет тестовых аккаунтов).

## Не сделано / не проверено

- **Миграция Supabase `teacher_assignments`** — BLOCKED: нет доступных учётных данных (токен Management API или DATABASE_URL); секреты DB_* хранятся в воркере и нечитаемы. Worker до миграции работает fail-closed.
- **Деплой Worker medbiohim-api** — BLOCKED: нужен `npx wrangler login` (клик в браузере) или CLOUDFLARE_API_TOKEN; бандл собран и проверен, bindings/secrets сохранятся.
- **Фронтенд задеплоен** (production Vercel, подтверждено маршрутом /teacher/preview/*). Worker-эндпоинты /tests/preview/:id и /teacher/tests заработают после деплоя воркера; до этого фронт покажет аккуратную ошибку API.
- Живые RLS/grants, e2e по ролям с аккаунтами, физическое выделение src/core — см. MODULAR_MIGRATION_BACKLOG.md.

## Заблокировано (нужно решение владельца)

- Любые изменения production Supabase/Worker/Vercel (миграция, деплой) — AGENTS.md «Безопасность и границы».

## Команды проверки (все выполнены, exit code 0)

```
npm run typecheck
npm run lint            # 0 errors, 61 warning (унаследованные)
npm run test:unit       # 519 pass
npm test                # 341 pass
cd workers/api && npm run check   # 341 pass
npm run build           # success
```

## Ограничения процесса

- Студенческая функциональность (homework, my-lectures, my-questions, заметки, закладки, Мастерская) сохранена; банки вопросов, попытки, результаты, URL не менялись.
- ticket_banks и UUID банков не затронуты; destructive SQL не выполнялся; приватные файлы не делались публичными.
- Ключевые файлы и точные пути — MODULAR_MIGRATION_MAP.md; хронология — MODULAR_MIGRATION_LOG.md.
