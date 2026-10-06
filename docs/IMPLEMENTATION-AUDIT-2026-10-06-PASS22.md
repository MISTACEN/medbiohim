# IMPLEMENTATION AUDIT — 2026-10-06 — PASS 22

## Legacy / stub / dead-code audit

### Fixed

1. `backend/config/routes/admin_rest.php` had dangerous partial-success fallbacks:
- admin users: Supabase failure could return `UserRepository::listUsers($lim)` and silently lose q/course/role filters;
- admin homeworks: repository failure could silently switch to another data source.

Both now fail closed with `503 DB_ERROR`. This prevents incomplete admin data being presented as authoritative.

2. `backend/src/Services/ProgressService.php` was a legacy service-key REST progress implementation. Repository search found only the class itself, an unused import in `platform.php`, and documentation references; no runtime call was found.

Removed:
- unused `ProgressService` import from `backend/config/routes/platform.php`;
- unused `backend/src/Services/ProgressService.php`.

### Important audit distinction

Search hits for `TODO`, `placeholder`, `return null`, and `return []` are not automatically defects. UI input placeholders and legitimate empty/error states remain valid. Only executable legacy/fake-success paths were changed.

### Remaining legacy candidates

- Historical documentation contains old placeholder/import references; these are documentation archaeology and should be reconciled separately without altering canonical content.
- `docs/organic_chemistry-exam-questions-id-map.json` is not present at the current path, so no deletion was attempted.
- Full target-runtime syntax/build remains unconfirmed because Vercel access is 403 and GitHub workflow runs are not exposed by the connected API.

## Gate status

- 🟢 fake partial-success admin fallbacks removed
- 🟢 unused legacy ProgressService removed
- 🟢 current live academic/test/preparation invariants remain clean from previous pass
- 🟡 runtime/build/browser gate still pending

Next: Pass 23 should audit route duplication, service/repository imports and frontend API functions with no consumer, then reconcile stale documentation traces.