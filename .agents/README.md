# Профили агентов MEDBIOHIM

Это repo-level инструкции, а не исполняемая платформа оркестрации. Они не создают агентов, не выдают доступы и не запускают subagent runtime. Исполнение остаётся в ZCode или другом выбранном пользователем host.

## Роли

- [Координатор](coordinator.md) — планирует, распределяет, собирает патчи и назначает одного интегратора.
- [Frontend](agents/frontend.md) — Next.js, интерфейс, клиентские API-обёртки и PWA.
- [Backend](agents/backend.md) — Cloudflare Workers/Hono, API routes, auth и Telegram API integration.
- [Database](agents/database.md) — Supabase schema, SQL, migrations, RLS и сверка ledger.
- [Education](agents/education.md) — содержание курсов, тесты, вопросы, лекции и научная корректность.
- [Storage](agents/storage.md) — B2/Upstash Blob, Redis, файловые API и media resolver.
- [DevOps](agents/devops.md) — Vercel/Cloudflare/GitHub workflows и release configuration.
- [QA/Security](agents/qa-security.md) — независимая проверка, регрессии, безопасность и доступность.

## Subagents

Профили субагентов описаны внутри инструкций направлений. Родительский агент делегирует им подзадачи только если текущий host действительно поддерживает subagents. Иначе выполняет те же чек-листы последовательно. Субагенты не получают право менять чужие зоны или обращаться к другим верхнеуровневым агентам.

## Текущий рабочий режим

Два верхнеуровневых ZCode-агента работают независимо и не знают друг о друге. Координатор (пользователь/ChatGPT или явно назначенный orchestrator) выдаёт каждому отдельный контекст и задачу. После обоих результатов он выбирает одного агента для отдельного этапа интеграции. Межагентной переписки и общего writable workspace нет.
