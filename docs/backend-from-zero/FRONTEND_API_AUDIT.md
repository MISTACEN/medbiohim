# Frontend-first backend audit — first pass

Date: 2026-10-16. Scope: `src/lib/api.ts` callers compared with `integrations/cloudflare-api/src/index.js`. This is a source-level comparison only; it is not a live endpoint or Supabase acceptance test.

## Confirmed frontend contract

The frontend centralizes HTTP calls in `src/lib/api.ts`, uses `/api/v1` as its base, attaches the current access token, attempts refresh on eligible 401 responses, and expects JSON API results with `ok`, `data`/`error`, and `requestId`. Binary media helpers have separate Blob handling and must be audited separately.

API caller families observed in the frontend:

- Auth: `/auth/register`, `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/recover`, `/auth/logout`.
- Core learning: `/dashboard`, `/schedule`, `/schedule/meta`, `/schedule/entries`, `/planner`, `/attendance/{id}`, `/homeworks`, `/homeworks/{id}/progress`, `/homeworks/{id}/submit`, `/progress`, `/curriculum`, `/academic/state`, `/academic/sync`, `/academic/ai-plan`.
- Content: `/subjects`, `/subjects-catalog`, `/subjects/{id}`, `/subjects/{id}/gradebook`, `/groups`, `/lectures`, `/lectures/{id}`, `/materials`, `/materials/{id}/file`, `/materials/{id}/file-url`, `/subject-plans/{slug}`, `/lesson-plan`, `/tickets`.
- Assessment: `/tests`, `/tests/{id}`, `/tests/{id}/start`, `/tests/attempts/{id}/answers`, `/tests/attempts/{id}/finish`, answer regrade, `/tests/preparation/*`, `/tests/chemistry-master`, `/tests/curriculum-map`, `/my/attempts`, `/questions`, `/questions/subjects`, `/questions/{id}/report`, `/tickets/generate`.
- Trainers/media: `/trainers/feed`, `/trainers/feed/{id}`, `/trainers/feed/{id}/image`, `/trainers/feed/answer`, lecture mini-quiz question/check calls, histology source-file access.
- Personal/collaboration: `/notes`, `/favorites`, `/favorites/toggle`, `/community/posts`, `/presence/heartbeat`.
- File operations: `/files/upload`, `/files/{id}`, material binary downloads, private histology source files.
- Admin: database connections/table/schema/rows and audited changes; schedule management/import; users/roles; announcements; content import/archive/move; lectures, materials, questions, question bank/reports, homework, community, Telegram and problem-center workflows.

## First concrete implementation gap to investigate

**`POST /api/v1/files/upload` is called by the frontend but no upload handler was found in the current Worker router source.** The router has handlers for file-record reads/downloads, but that does not implement upload. This is a source-level finding; it must be confirmed against the exact deployed bundle before calling it a live outage.

Do not patch this with a fake success response or write bytes to an arbitrary storage key. Before implementing upload, verify the actual Supabase file-record schema, the allowed group/specialty rules, and whether existing private storage is Upstash Blob or Backblaze B2 for this file class. Then implement authenticated ownership/group checks, strict size/type limits, object upload, metadata persistence, cleanup on partial failure, and download authorization together.

## Priority order for the next code passes

1. Complete route inventory by comparing every exported frontend API function against Worker dispatch and handler modules; mark each route implemented, missing, or dependency-blocked.
2. P0: authenticate `/auth/me` and refresh lifecycle; dashboard; schedule read and mutations; homework create/progress/submit; file upload/download; groups/subjects; account settings.
3. P1: assessment attempt/preparation/training lifecycles and private media bytes.
4. P2: remaining community, AI and academic workflows.
5. P3: admin CRUD/imports and audit tools.

## Verification labels

- Source route exists: not proof of correct authorization or data shape.
- Unit tests pass: only when run against the exact source commit and the command/result are recorded.
- Runtime verified: only after a real shadow request using the correct role and expected data scope.
- Production enabled: only after explicit acceptance; this audit did not change routing or deploy anything.