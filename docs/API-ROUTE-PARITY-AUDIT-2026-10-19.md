# MEDBIOHIM — route parity audit (2026-10-19)

Static source audit on `main`; not a real-user/browser acceptance test.

## Current topology

Browser → Vercel same-origin `/api/v1/*` proxy → canonical Cloudflare Worker `medbiohim-api` → (only on HTTP 501) service binding `MEDBIOHIM_UPSTREAM` → `medbiohim-api-shadow`.

The Vercel proxy in `src/app/api/v1/[...path]/route.ts` forwards only to `CLOUDFLARE_API_ORIGIN` (default `https://medbiohim-api.ryazansevegor.workers.dev/api/v1`) and returns 502 if the origin is unavailable. It does not fall back to SpaceWeb PHP. The canonical router `workers/api/src/index.ts` mounts the route families below and forwards 501 responses to shadow. A mounted family does not prove every legacy method is implemented or that production runs the current source.

## Route-family matrix

| Family | Current source finding | Decision |
|---|---|---|
| Auth/profile | `/auth`, `/me`, `/auth/me` alias are mounted. Historical notes say login/register are fail-closed until rate limiting is verified. | KEEP; test live flow |
| Dashboard, groups, subjects, curriculum/plans | Canonical modules and aliases are mounted. Exact legacy CRUD parity remains to be compared method-by-method. | KEEP |
| Schedule, lesson plan, attendance | Canonical modules and admin schedule handlers exist. Role-specific read/write acceptance remains. | KEEP |
| Homework, submissions, planner, academic | Modules are mounted; canonical homework source has list/create/submit/progress handlers. Old inventory red marks for create/submit are stale. | KEEP; verify grading and academic contracts |
| Tests/preparation | Both `preparation` and `tests` routers are mounted at `/tests`. Overlapping route/method precedence must be tested. | KEEP; inspect overlap |
| Training, trainers, sessions, progress, SRS | Modules are mounted. Frontend explicitly calls trainer feed/detail/answer/image endpoints; handlers exist. Blob reads and UI rendering remain live acceptance gates. | KEEP |
| Materials/histology | Canonical source includes `/:id/file-url`, `/:id/file`, `/source-materials`, `/source-file`, matching frontend call paths. Blob key existence, MIME and authenticated reads remain unverified here. | KEEP |
| Files | `/files` and `POST /files/upload` alias exist; current file module includes upload, metadata and download handlers. | KEEP; verify authorization/object storage |
| Settings/Telegram | Modules are mounted; exact account/preferences/link/unlink paths need method-level comparison with frontend and bot. | KEEP |
| Admin/database | Admin router and database subrouter exist with questions, lectures, users, schedule, imports, files audit and announcements. Image processing explicitly returns 501 `MEDIA_PROCESSING_UNAVAILABLE`. | KEEP; test admin role |
| Community, calculators, AI, chemistry, presence, favorites/search/questions/tickets | Route modules are imported and mounted; exact endpoint/role/secret contracts and optional-service behavior need acceptance tests. | KEEP |
| Unknown/unimplemented routes | Canonical catch-all returns 501 `ROUTE_NOT_IMPLEMENTED`; router middleware forwards 501 to shadow if the service binding exists. | KEEP shadow |
| `integrations/cloudflare-api/` | Shadow compatibility implementation remains a runtime dependency for canonical 501 responses. | KEEP until fallback is proven unused |
| `backend/` PHP | Current Vercel proxy does not route to PHP; PHP is retained as migration/source reference. | ARCHIVE only after parity and data checks; do not delete now |

## Frontend paths confirmed in `src/lib/api.ts`

- `/auth/refresh`, `/auth/logout`
- `/trainers/feed`, `/trainers/feed/:id`, `/trainers/feed/answer`, `/trainers/feed/:id/image`
- `/materials/:id/file-url`, `/materials/:id/file`
- `/histology/source-file`
- `/files/upload`, `/files/:id/download`

Most other calls use the shared `api(path, options)` helper, so literal-fetch-only searches undercount API usage.

## Documentation contradictions confirmed

1. `README.md` says both Cloudflare-only and Browser → SpaceWeb PHP / “production traffic not switched”; the latter conflicts with the current proxy source. It also advertises old branches despite the project instruction to work on `main`.
2. `docs/SPACEWEB-API-INVENTORY.md` is dated 2026-10-14 and contains stale Cloudflare status cells. Keep it as the PHP source inventory, not as current implementation truth.
3. `docs/CLOUDFLARE-API-ROUTE-INVENTORY-2026-10-12.md` contains historical status statements; treat it as a dated migration log.
4. `src/lib/api.ts` still calls itself the “SpaceWeb backend” client, though it uses same-origin `/api/v1` and the current proxy targets Cloudflare. Update only the comment; this client is core functionality and must not be removed.
5. Older `PHASES_STATUS.md` deployment snapshots describe `medbiohim-api` as a gateway rather than the current Hono source. Verify the live deployed version before claiming source/deployment parity.

## Required gates before cleanup

- Confirm live `medbiohim-api` version matches `workers/api/` on `main`.
- Compare exact frontend endpoint + HTTP method + body/response shape with canonical handlers, shadow and `backend/config/routes.php`.
- Run canonical typecheck/tests and test duplicate `/tests` router precedence and 501-only fallback.
- Run student/admin smoke tests for auth, schedule, homework, test attempts, files/media, settings and admin writes.
- Verify all 206 histology media objects and source files through authenticated API and UI.
- Observe fallback use over a real usage window before removing shadow.

## Decision

No backend tree is safe to remove yet. Documentation correction and workflow hardening are the safest cleanup steps. Removing shadow is high risk while canonical source deliberately forwards 501 responses to it.


## Live deployment and route regression update (2026-10-19)

- Canonical Worker production version 81 is deployed; GitHub deploy run [39254961127](https://github.com/MISTACEN/medbiohim/actions/runs/39254961127) succeeded.
- Fixed the Hono 501 fallback: the service-binding response is now assigned to `c.res`, so it replaces the finalized canonical response. Live smoke now receives the shadow response for an unimplemented path.
- Added admin endpoints for community moderation, homework list/create/safe-delete, file-backed materials list/safe-delete, problem-center/report/work management, site settings, content archive/move, and content-version audit/rollback.
- All new routes return 401 without a token, confirming auth middleware is attached. This is route registration evidence only; authenticated create/update flows remain unverified without a test session.
- Histology media remains blocked: all 206 published card image routes returned 404. See [production route and media audit](PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md).
