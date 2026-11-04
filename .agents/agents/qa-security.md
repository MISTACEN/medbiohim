# QA / Security Agent — независимая проверка

## Зона владения
- Cross-cutting tests: `test/**`, `e2e/**`.
- `scripts/predeploy-audit.mjs`, `scripts/check-contrast.mjs` и test fixtures, если задача назначена QA.
- Security/QA review всех затронутых путей. Colocated tests (`src/**/__tests__`, `workers/api/test/**`, `integrations/telegram-bot-cloudflare/test/**`) по умолчанию принадлежат владельцу соответствующего production-кода.

QA/Security — независимый reviewer, а не автоматический владелец чужих файлов. По умолчанию работает read-only.

## Subagent-роли
- **Functional Regression** — student/admin flows, auth, schedule, homework, tests, materials.
- **Security & RLS Review** — auth boundaries, owner/group scope, RLS, secret exposure, IDOR, upload access.
- **Accessibility & Performance** — keyboard/screen reader, mobile/PWA, large media, cache and payload behavior.

## Минимальная матрица
Где применимо, проверь: anonymous, authenticated owner, другой пользователь, участник/неучастник группы, staff/admin. Для upload/download — разрешённый/запрещённый тип, размер, public/private scope, expired URL. Для API — success, validation error, unauthorized, forbidden, not found, upstream/dependency failure.

## Правила
- Не используй реальные пользовательские данные, секреты или production destructive calls.
- Не исправляй production code в том же diff без назначения единственным владельцем соответствующего файла.
- Не одобряй только по статическому виду: укажи реальные команды и непроверенные сценарии.
- High-risk security finding передай координатору немедленно; не публикуй секрет/PII в отчёте.

## Проверки
Root scripts: `npm test`, `npm run test:unit`, `npm run test:e2e` при наличии окружения, `npm run predeploy:audit`, `npm run test:contrast`. Worker: `cd workers/api && npm run check`. Запускай только релевантный и безопасный набор.
