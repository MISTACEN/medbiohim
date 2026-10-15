# MEDBIOHIM backend — greenfield implementation contract

**Decision (2026-10-16):** treat the existing frontend as the source of truth. Do not assume a PHP backend exists, do not port PHP routes, and do not treat earlier Cloudflare modules as correct merely because they exist. Re-derive each API behavior from the frontend callers, UI states, data shapes, and actual Supabase schema/RLS. The Cloudflare Worker is the target backend.

## Non-negotiable architecture

- **Cloudflare Workers**: HTTP API, validation, authentication/session orchestration, authorization checks, request IDs, rate limiting, safe error mapping, and streaming private media.
- **Supabase**: identity, relational data, migrations/RPCs, and RLS. User-scoped requests use the caller's JWT and anon/publishable key. Never expose service-role credentials to the browser. Never weaken RLS to mask an implementation bug.
- **Upstash Redis**: optional cache, throttling and ephemeral coordination only. Redis outages must not corrupt durable data; cache failure should fail open where safe.
- **Upstash Blob / Backblaze B2**: private object storage for files and histology media. Object metadata/ownership stays in Supabase. A browser-facing private-file route must stream bytes from the Worker or return a deliberately CORS-configured signed URL; do not assume a redirect works.
- **Frontend contract**: keep same-origin /api/v1/..., { ok: true, data, requestId } and { ok: false, error: { code, message }, requestId } for JSON responses unless a binary endpoint explicitly requires another shape.
- **Deployment**: main only; no feature branches. Shadow/staging verification before any production routing change. Do not switch production traffic as part of an unverified code change.
- **Free-tier constraint**: prefer designs that do not require attaching a payment card. Never create a new paid dependency without calling it out.

## How to rebuild each endpoint

For every frontend API caller:
1. Record path, method, query/body schema, expected response shape, loading/empty/error states, and which screen consumes it.
2. Trace UI use and normalize field names without breaking existing components.
3. Verify the real Supabase tables, columns, relationships, RPCs, RLS policies and storage key layout; do not guess from old PHP.
4. Implement input validation, caller authentication, ownership/group scoping, server-derived roles, safe error handling and request IDs.
5. Add unit tests for success, invalid input, unauthenticated, forbidden/cross-group access, missing dependency and unexpected upstream errors.
6. Run tests and Worker dry-run against the exact main tree; record actual results. For data-sensitive routes, test with a student JWT and admin/staff JWT without logging tokens.
7. Verify the deployed shadow endpoint and browser behavior. Only then mark the route verified.

## Frontend-derived API domains

- Authentication and account: register, login, me, refresh, logout, recovery, settings, preferences, password change, linked Telegram/Google identity.
- Dashboard and academic data: dashboard, profile bundle, groups, subjects, subject catalog/detail/gradebook, curriculum, plans, schedule/meta/entries, attendance, progress and academic planning.
- Student work: planner, homework CRUD/progress/submission/grading, file upload/download, notes, favorites, community posts and presence.
- Assessment: tests and question banks, attempts, answer persistence/regrading, preparation sessions, training sessions, tickets, trainer feed/cards/answers, lecture mini-quizzes and question reports.
- Learning materials: lectures, materials, histology source files, private trainer images, file URLs and binary streams.
- AI: tutor metadata/subjects, conversations/messages, academic plan generation and chemistry resolution. Provider secrets remain Worker-side; enforce quotas, request size limits and timeouts.
- Admin/content: users/roles, schedule import and editing, announcements, lectures/materials/questions, content validation/import/archive, Telegram management, problem center and database/file audit.

## Security invariants

- Client-supplied role, user_id, ownership, or group membership never grants access.
- Authenticated data access is caller-JWT + RLS; admin-only mutations require a server-verified role and still rely on database authorization.
- Never return answer keys, hidden answer snapshots, private object keys, provider secrets, refresh tokens in logs, or raw upstream error bodies.
- Validate UUIDs, enums, dates, pagination, file size/type, MIME and allowed storage prefixes.
- Rate-limit login/recovery, AI calls, uploads, answer submission and other abuse-prone endpoints.
- CORS allowlist only; no wildcard credentialed CORS. Private binary responses use private, no-store and nosniff.
- Missing database RPC/schema/config is a real controlled error, not a fabricated success response.

## Work order and completion gates

1. **Inventory and contract tests** — enumerate every frontend caller and compare it to Worker dispatch. Every endpoint must be implemented, deliberately unsupported, or not implemented; no silent fall-through.
2. **Foundation** — shared response/error helpers, request IDs, body limits, CORS, authentication, server-derived roles, rate limits, config validation and safe observability.
3. **P0 core** — auth/me and refresh lifecycle; dashboard; schedule read + CRUD; homework read/create/progress/submit/attachments; groups/subjects; account settings.
4. **P1 learning** — tests/attempts/preparation/training lifecycle, private media and material downloads, progress, curriculum and tickets.
5. **P2 collaboration and AI** — community, presence, notes/favorites, tutor/chat, academic planning and chemistry tools.
6. **P3 admin** — content workflows, imports, moderation, role management and audited database tools.
7. **Acceptance** — exact-main tests, Worker dry-run, live shadow smoke with real role-scoped tokens, browser smoke for every primary screen, then explicit deployment review.

## Status semantics

- **Implemented** means code exists.
- **Tested** means the exact current main source passed a named test command.
- **Runtime-verified** means a real deployed shadow request returned the expected response with appropriate identity and data scope.
- **Production-enabled** means production routing was explicitly switched after acceptance.

These labels are not interchangeable. No feature is complete based only on a route existing or a test file being written.