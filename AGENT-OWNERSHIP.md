# MEDBIOHIM — file ownership and conflict map

## Ownership matrix
| Area | Primary owner | Paths / boundaries | Notes |
|---|---|---|---|
| Next.js frontend | Frontend | `src/app/**`, `src/components/**`, `src/lib/**`, `src/data/**` (UI-facing fixtures only), `public/**` | Education owns source content in `src/data` / `public/content`; assign exact file per task |
| API proxy | Frontend | `src/app/api/v1/[...path]/route.ts` | Shared boundary; proxy behavior changes require Backend + QA review |
| Canonical Worker | Backend | `workers/api/src/**`, `workers/api/wrangler.toml` | Storage owns selected adapter files; Backend owns route integration |
| Database | Database | `database/migrations/**`, `backend/database/migrations/**`, `supabase/migrations/**` | Multiple historical dirs; do not assume all are active |
| Education content | Education | `src/data/**`, `public/content/**`, subject source docs | Exact subject/specialty/mode scope required |
| General storage | Storage | `workers/api/src/lib/b2.ts`, storage helpers/tests, manifests | Shared with Backend by explicit file reservation |
| Trainer media | Backend (route) + Storage (adapter/index) | `workers/api/src/routes/trainers.ts`, `workers/api/src/data/histology-drive-index.json` | One integration owner per task; do not dual-edit |
| Telegram Worker | Backend | `integrations/telegram-bot-cloudflare/**` | DevOps owns deployment workflow/config; coordinate |
| CI/CD and release | DevOps | `.github/workflows/**`, deploy scripts/docs | No production release without approval |
| Tests/security | QA/Security | actual test directories, test plans/reports | Feature owner may add unit tests in owned module; independent QA owns acceptance gate |
| Legacy PHP | No default owner | `backend/**` except DB migration path, `integrations/cloudflare-api/**` | Read-only unless task explicitly targets migration/legacy |

## Shared/high-conflict files
Root `package.json`, lockfiles, `next.config.ts`, `tsconfig.json`, Worker `wrangler.toml`, Worker route registry/entrypoint, common Env/types, response helpers, auth middleware, root README, migration ledgers and shared content indexes require one named owner and coordinator approval. Do not let parallel agents edit them.

## Reservation rule
Before dispatch, coordinator records: file path, primary owner, optional reviewer, base SHA, reservation expiry and dependencies. Any file not listed is read-only. If new file ownership is unclear, stop and ask coordinator.

## Path discovery
This table is a routing convention, not a claim every listed path exists. Verify paths in current main. In particular, migration directories have distinct historical contents and the root test layout may differ; never create a parallel duplicate folder simply to match this document.
