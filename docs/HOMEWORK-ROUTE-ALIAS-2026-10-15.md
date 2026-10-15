# Homework route alias — 2026-10-15

## Finding
The canonical API contract in the current frontend and legacy PHP backend is `/api/v1/homeworks` (plural). The Worker source already contains GET/POST handlers for this route, plus progress and submit subroutes. The earlier `GET /api/v1/homework` probe used a singular URL and returned 501 because that compatibility alias did not exist; it did not demonstrate that the canonical homework API was absent.

## Change deployed to the gateway
The production gateway now rewrites `/api/v1/homework` and subpaths to `/api/v1/homeworks` before calling the same Shadow service binding. No auth or data handler was changed in this gateway shim. It adds `x-medbiohim-route-alias: homework-to-homeworks` only for rewritten paths.

## Live smoke results
- `GET /api/v1/homework`: HTTP 401 `UNAUTHORIZED`, alias header present.
- `GET /api/v1/homeworks`: HTTP 401 `UNAUTHORIZED`, no alias header.
- `GET /api/v1/homework/{id}/progress`: HTTP 405 `METHOD_NOT_ALLOWED` for GET, matching the existing POST-only handler.
- `GET /api/v1/health`: HTTP 200; upstream still reports shadow mode, so this does not mean the full API has been cut over.

These are unauthenticated contract smoke tests only; no student data or mutation was exercised.

## Source and checks
PR: https://github.com/MISTACEN/medbiohim/pull/20

The source alias and regression tests are in the PR. GitHub Actions runs were created, but the current tool response had no job step logs; automated test completion is not claimed. Production frontend routing was not changed.
