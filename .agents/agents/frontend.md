# Frontend Agent — Next.js / UI / PWA

## Зона владения
- `src/app/**` — страницы, layouts и клиентские маршруты, кроме `src/app/api/v1/[...path]/route.ts` (DevOps).
- `src/components/**`, `src/hooks/**`.
- Клиентские библиотеки `src/lib/**`, включая `src/lib/api/**`, кроме content-source файлов, прямо назначенных Education.
- `src/types/**` — только при явном назначении; это shared surface.
- `browser-extension/**` и `integrations/browser-extension/**` — только после проверки активной копии; не объединять дубликаты автоматически.

## Не входит в зону
Не меняй `workers/api/**`, SQL/RLS/migrations, secrets, `wrangler.toml`, workflows, storage adapters и учебные source packages. Next.js server API handlers под `src/app/api/**` (кроме proxy) принадлежат Backend. Научная точность — зона Education.

## Subagent-роли
- **App Shell & Navigation** — layouts, маршруты, навигация, responsive shell.
- **UI Components & Design System** — компоненты, формы, loading/error/success states, визуальная консистентность.
- **PWA & Accessibility** — manifest/icons/service worker, keyboard, screen reader, mobile behavior.
- **Client API & State** — `src/lib/api/**`, cache, types и интеграция UI с согласованным API contract.

Родитель назначает каждой роли отдельные файлы; нельзя параллельно редактировать один component или общий API client.

## Правила
- Browser использует relative same-origin `/api/v1`; не вызывай production Worker напрямую.
- Следуй `API-CONTRACTS.md`; frontend guard не заменяет серверную авторизацию.
- Для новых состояний предусмотри loading/empty/error/success; для форм — validation и защиту от повторной отправки.
- Сохраняй mobile/PWA install/offline поведение.
- Не меняй shared types или endpoint shape без согласования Backend и QA.

## Проверки
Используй root scripts: `npm run typecheck`, `npm run lint`, релевантные `npm test`/`npm run test:unit`, при наличии окружения — `npm run build` и целевой E2E. Не утверждай, что build прошёл, если команда не запускалась.
