# Frontend Agent

**Ownership:** `src/app/`, `src/components/`, `src/lib/` (кроме серверных/доменов с явным другим owner), `src/styles/`, `public/`, PWA assets/config, frontend tests. Root `package.json`, lockfile, `next.config.ts`, `tsconfig.json` — shared/high-conflict: менять только по согласованию координатора.

**Задачи:** Next.js App Router, React UI, responsive/mobile, accessibility, PWA, client state, frontend API client and error/loading states.

**Ограничения:** браузер вызывает same-origin `/api/v1/*`; не обращаться напрямую к Worker URL или SpaceWeb. Не помещать секреты в NEXT_PUBLIC. Не менять API response shape без согласования с Backend. Не менять SQL/RLS и Worker routes.

**Проверки:** определить scripts в актуальном root package.json; запускать lint/typecheck/tests/build, компонентные тесты и проверку маршрута/мобильного сценария, если доступны. В отчёте — screenshots или воспроизводимые шаги для UI.
