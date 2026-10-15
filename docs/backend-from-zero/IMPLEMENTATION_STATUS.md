# Backend implementation status — frontend-first

Updated: 2026-10-16. Source inspection only; no live request or deployment is implied.

## Pass 1 — contract inventory and safety gates

- [x] Confirm the frontend's same-origin `/api/v1` base and JSON envelope.
- [x] Confirm explicit Worker dispatch for the P0 auth, dashboard, schedule, planner, homework, progress and account-settings path families.
- [x] Add a static contract test so the critical path families cannot silently disappear during edits.
- [x] Keep the file-upload gap visible as a deliberate failing-to-implement marker in the contract test (the test passes only while the gap remains known and must be replaced when upload is implemented).
- [ ] Enumerate every exported frontend API function against Worker methods, not just path families.
- [ ] Run `npm test` and Worker dry-run against the exact `main` tree.
- [ ] Runtime-smoke the shadow Worker with real student/admin identities.

## Pass 2 — P0 implementation

| Area | Source status | Next acceptance gate |
|---|---|---|
| Auth register/login/me/refresh/recovery/logout | Dispatch and handler functions exist | Test expiry/refresh, unauthenticated access, role/profile payload |
| Dashboard | Aggregated read model exists with partial-data degradation | Validate response shape against dashboard components and real RLS data |
| Schedule read/meta and entry mutations | Dispatch and mutation module exist | Verify CRUD, group scoping, forbidden cross-group edits |
| Homework list/create/progress/submit | Dispatch and modules exist | Verify student-created work policy, ownership and attachment flow |
| Account settings | Read/update routes exist | Verify profile/preference writes and Telegram linking |
| File upload | **Not implemented in Worker router** | Verify storage provider and metadata insert authorization/RPC before coding |
| Groups/subjects CRUD | Frontend calls exist; coverage is incomplete at source level | Finish endpoint/method parity inventory before marking complete |

## File upload blocker

The frontend submits multipart `file`, optional `group_id`, and optional `specialty_slug` to `POST /api/v1/files/upload`. The Worker has metadata/download reads, but no upload handler. The existing RLS hardening migration drops direct insert/update policies on `public.files`; do not bypass that with a service-role key or broad policy. The implementation needs a narrowly scoped authenticated RPC (or another explicitly approved server-side insert path), group/specialty authorization, storage upload, metadata insert, and compensating object cleanup on failure. The current download implementation signs Backblaze B2 URLs, so Upstash Blob cannot be substituted for these files without adding a compatible private download path.

## Completion language

No code is called tested until the test command actually runs on the resulting commit. No route is runtime-verified until the deployed shadow Worker has been exercised with role-scoped credentials. Production routing remains unchanged.
