# MEDBIOHIM — архитектура параллельной работы ИИ-агентов

## 1. Назначение и границы

Документ задаёт repo-level правила для независимой параллельной разработки, внутренних subagents и контролируемой интеграции. Это не runtime, не диспетчер задач и не новая платформа. Отдельный сервис оркестрации (Eve или аналог) не требуется.

`AGENTS.md` и `.agents/**` — инструкции для host-агента. Возможности запуска subagents, доступ к терминалу и workspace зависят от ZCode/другого host и должны проверяться, а не предполагаться.

## 2. Топология проекта

```text
Browser / PWA
  -> Next.js (Vercel)
  -> same-origin /api/v1/*
  -> src/app/api/v1/[...path]/route.ts
  -> Cloudflare Worker: medbiohim-api (Hono)
  -> Supabase / Upstash Redis / storage
```

Дополнительно:
- `medbiohim-telegram` — отдельный Cloudflare Worker бота.
- `medbiohim-api-shadow` — compatibility fallback только для HTTP 501, не primary API.
- Общие файлы используют B2 → Upstash fallback через `workers/api/src/lib/b2.ts`.
- Изображения тренажёра/гистологии имеют отдельный Drive index → public Upstash resolver в `workers/api/src/routes/trainers.ts`.
- PHP/SpaceWeb и `integrations/cloudflare-api/` — legacy/reference, не canonical API.

## 3. Уровни ответственности

1. **Пользователь/maintainer** — задаёт цель, разрешает рискованные операции и принимает изменение.
2. **Координатор** — читает актуальный main, делит задачу, назначает владельцев файлов, согласует contracts, получает патчи, назначает интегратора и reviewer.
3. **Верхнеуровневые агенты** — автономно выполняют отдельные части в разных рабочих копиях.
4. **Subagents** — внутренние исполнители/ревьюеры одного родительского агента, если host это поддерживает.
5. **QA/Security** — независимая проверка интегрированного результата.

## 4. Независимые верхнеуровневые агенты

В текущем рабочем процессе пользователя два ZCode-агента работают независимо (обычно на GLM-5.3 Flash). Это два автономных исполнителя с собственными инструментами и workspace, а не два текстовых ответа в одном диалоге.

- Каждый получает отдельный самодостаточный prompt и собственную зону файлов.
- Они не знают друг о друге, не переписываются, не читают чужие диалоги и не ждут чужих результатов.
- Они не используют общий writable workspace и не редактируют один файл одновременно.
- Каждый возвращает patch/diff и отчёт координатору.
- После обоих результатов координатор назначает одному из этих же агентов отдельную задачу интеграции. Передаётся только обезличенный patch-артефакт; контакта между агентами нет.
- Если задача не делится безопасно, один агент делает read-only анализ, второй выполняет отдельную реализацию после согласования contract.

Модель/provider не являются зависимостью репозитория; GLM-5.3 Flash — текущая конфигурация, а не требование к будущим исполнителям.

## 5. Специализированные направления

| Роль | Ответственность | Согласует с |
|---|---|---|
| Frontend | Next.js, UI, PWA, client API | Backend, Education, QA |
| Backend | Cloudflare Workers/Hono, auth, routes, Telegram API | Database, Storage, Frontend, DevOps |
| Database | Supabase schema, migrations, RPC, RLS | Backend, QA/Security |
| Education | Гистология, физиология, химия, эмбриология, вопросы и материалы | Frontend, Backend, Database |
| Storage | B2, Upstash Blob/Redis, object access, media | Backend, Education, DevOps |
| DevOps | Vercel, Cloudflare topology, GitHub workflows, release | владельцы затронутых компонентов |
| QA/Security | Независимая функциональная и security проверка | координатор и владельцы изменений |

Точные пути указаны в `AGENT-OWNERSHIP.md`; инструкции ролей находятся в `.agents/agents/`.

## 6. Subagents

Для больших направлений предусмотрены внутренние роли: UI/PWA/API-client; domain routes/auth/Telegram; schema/migrations/RLS/data audit; histology-embryology/physiology/chemistry/question bank; file adapter/trainer media/Redis; Vercel/Cloudflare/CI; functional regression/security/accessibility.

Subagent получает одну ограниченную подзадачу и список файлов, работает только в workspace родителя, возвращает patch и проверки, не коммитит и не деплоит самостоятельно. Если host не поддерживает subagents, родитель выполняет эти роли последовательно как checklist. Не создавай runtime ради имитации subagents.

## 7. Модель параллельной разработки

```text
main @ base SHA
  ├─ Agent A: isolated workspace → patch A ─┐
  └─ Agent B: isolated workspace → patch B ─┤
                                             v
                               Coordinator checks both
                                             |
                               chooses one integrator
                                             v
                         isolated integration workspace
                          apply A/B sequentially + resolve
                                             |
                                  independent QA review
                                             |
                           maintainer approval → one main commit
```

- `main` — каноническая ветка и источник истины.
- По умолчанию не создаются постоянные remote branches. Изоляция — отдельные локальные worktree/clone и patch files.
- На `main` одновременно пишет только один назначенный интегратор/maintainer.
- Параллельные агенты не пушат и не создают PR самостоятельно.
- Перед commit проверяется, что `main` не ушёл вперёд относительно base SHA; при расхождении patch пересобирается.
- Существующие `beta`, feature/fix и backup branches не удалять и не считать актуальными без отдельной проверки.

## 8. Безопасность и change control

Секреты не читаются/не копируются в prompt, diff или logs. Production DB, RLS grants, migrations, storage uploads/deletes, Worker/Vercel deploy и DNS/bindings требуют отдельного разрешения. Не использовать реальные student records. Любое изменение auth, RLS, URL, payload, error/status или binary/media behavior — coordinated contract change. Shared file имеет одного writer.

## 9. Статусы

Код в main, commit, CI, deployment, production build verification и runtime smoke — разные статусы. Ни один из них не подразумевает следующий автоматически.
