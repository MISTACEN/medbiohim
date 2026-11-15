# Layero CLI JSON events

Full reference: <https://docs.layero.ru/en/cli/json-events> (ru:
<https://docs.layero.ru/cli/json-events>). Here is what an agent needs during
a deploy.

The mode is switched on by the `--json` flag, by the `LAYERO_JSON=1` variable,
and by itself — inside an agent or with a non-TTY stdout. In this mode the CLI
asks no questions (`--prod` still needs `--yes`), prints one line
`{"event": "...", "ts": "<ISO-8601>", ...}` per action, and errors come with a
stable `code` and `next_action`.

## Deploy events

| event | fields | what to do |
|---|---|---|
| `auth_required` | `url`, `user_code` | Show `url` as a clickable link. The CLI polls every 2 s, the token is cached in `~/.layero/config.json`. There is no localhost callback — the browser may be on another machine. Expiry — `error{auth_expired \| auth_timeout}`. |
| `authorized` | `user` | Login succeeded. |
| `project_created` | `project_id`, `slug`, `organization` | First deploy in the folder — a project was created. |
| `project_linked` | `project_id`, `slug` | Deploy into the project from `.layero/project.json`. |
| `detected` | `framework`, `build_cmd` (null = no build), `output_dir` (null = known after the build), `confident`, `sources`, `hint`, `next_action`, `candidates`, `runtime_kind`, `layero_warnings` | How the CLI sees the folder — advice, never saved to the project. `confident: false` — the folder was not recognised: `hint` names the shape (app in a subfolder, frontend + backend, custom build script, server), `next_action` is the fix — do it before deploying. Values from `layero.json` are already applied here. `layero_warnings` — keys of `layero.json` the platform will not apply, with the right name (`"type"` → `"framework"` or `"runtime"`). |
| `plan` | same as `detected` plus `root`, `project`, `project_settings`, `creates_project`, `replaces_live_site` | `deploy --dry-run` only: the build plan in the builder's order (`layero.json` > project settings > detection). Nothing is uploaded or created; no login needed. |
| `packing` | `files`, `bytes`, `sha256` | The folder was packed into a tar.gz. |
| `uploading` / `uploaded` | `archive_key` | Archive upload. |
| `prebuilt` | `dir` | Deploy of a ready build (`--prebuilt <dir>`); the build on the platform is skipped. |
| `runtime_type_applied` | `project_type` | The project runs as a container app (`ssr_next`, `node_web`, `python_web`, `streamlit`, `gradio`, `flask`) — set on creation or by `--type`. |
| `runtime_type_apply_failed` | `error` | The type was not set; the deploy goes on with the previous one. |
| `setup_applied` | — | Project settings accepted. Only what you named explicitly (`--type`, your own `.layero/project.json`) is written; everything else the builder decides from the archive on every build. |
| `repeated_failure_guard` | `streak`, `threshold`, `scope`, `failure_stage`, `error` | Consecutive builds fail with the same error — the platform stopped. Read `error`, remove the cause. It cannot be continued automatically. |
| `deploy_started` | `deploy_id` | The backend accepted the job. |
| `stage` | `name`: `clone`/`install`/`build`/`upload`/`activate`/… | Build stage; arrives before the first log line of that stage. |
| `queued` | `waited_s` | The build is waiting for a builder; printed every 15 s until the first `stage`. Not a failure — keep waiting. |
| `build_log` | `line`, `stream` | Raw log. Forward only the lines with errors. `npm http fetch/cache` lines are hidden (one marker line instead). |
| `ready` | `url`, `dashboard_url`, `deploy_id`, `edge_ready`, `screen` | **Final.** `url` is the live public address, already answering: the CLI waits (up to 90 s) until it serves the site instead of a platform page. Show it as is and stop. `dashboard_url` is the dashboard, not the site. `edge_ready: false` (with `screen`) — the app never came up: `npx layero@latest logs --runtime`. `preview_url` and `edge_eta_seconds` are legacy. |
| `claimable` | `project_id`, `slug`, `url`, `claim_url`, `expires_at` | Deploy without an account (`--claim`): a temporary site for 1 hour — static sites and SPAs only, random address, closed to search engines. Arrives **before** `ready`, on every deploy of that folder. Hand the person `claim_url` — only they can take the site over, in the dashboard. `diagnose` / `logs` in that folder work without an account. |
| `promoted` | `url`, `deploy_id` | The apex was switched to the deploy (`layero promote`, `deploy --promote`). |
| `error` | `code`, `next_action`, `message` | Follow `next_action`. |

## Events of the other commands

| event | command | fields |
|---|---|---|
| `me` | `whoami` | `id`, `username`, `email`, `github_login` |
| `projects` | `projects list` | `projects[]`: `id`, `slug`, `name`, `organization`, `url`, `source_type`, `repo`, `status` |
| `organizations` | `orgs list` | `organizations[]`: `id`, `slug`, `kind`, `role` |
| `project_created` | `projects create --repo` | same as for a deploy, plus `url`, `repo`, `branch` |
| `source_connected` | `sources connect`, `projects create` | `org`, `connection_id`, `provider`, `account` |
| `webhook_installed` / `webhook_unavailable` | `projects create` | `project`, `url` (a GitHub App has no `url` field: the webhook is part of the installation); `webhook_unavailable` also has `hint`. Without a webhook a push does not build — tell the person and give them `url` for manual setup. |
| `setup_applied` | `projects create` | `project`, `framework`, `build_cmd`, `output_dir`, `layero_found`. The command finished the setup wizard by itself; `deploy_started` follows. `framework`/`build_cmd`/`output_dir` are what detection saw, for information: they are NOT written into the project — the builder detects them from the repository on every build (CLI 0.11.4+) |
| `deploy_started` | `projects create`, `deploy` | `deploy_id`; for `projects create` also `project`, `url`. The first build is running — continue with `deploys list --project <slug>` or MCP `site_status` |
| `setup_pending` | `projects create --no-deploy` | `project`, `url`, `hint`. The project is left in the setup wizard: there will be no builds until the person finishes the setup at `url` |
| `setup_failed` | `projects create` | `project`, `reason`, `url`, `hint`. The project **is created** (exit 0), but detection, setup or the build start failed — tell the person to finish in the dashboard at `url` |
| `sources` | `sources list` | `org`, `providers[]` (`id`, `title`, `self_hosted`, `webhook_supported`, `token_hint`), `connections[]` (`id`, `provider`, `account`, `status`, `projects_count`, `token_expiry_state`, `last_error`) |
| `source_repos` | `sources repos` | `org`, `connection_id`, `repos[]` (`path`, `name`, `default_branch`, `private`, `can_admin`) |
| `environments` | `envs list` | `project`, `environments[]` (`id`, `branch`, `url`, `hostname`, `active_deploy_id`, `active_deploy_at`, `production`) |
| `project_deleted` | `projects delete --yes` | `project_id`, `slug` |
| `project_linked` | `link` | `project_id`, `slug`, `url`, `status` |
| `hooks` / `hook_created` / `hook_deleted` | `hooks *` | `project`, `hooks[]` / `id`, `name`, `branch`, `target`, `url` / `id` |
| `init_done` | `init` | `framework`, `confident`, `agent_docs[]` (`file`, `result`), `project_json` — `init` records no settings |
| `logged_out` | `logout` | `config_path` |
| `claim_status` | `claim status` | `code`, `status`, `claimed`, `expires_at`, `url`, `claim_url` |
| `claim_accept` | `claim accept` | `code`, `claim_url`, `opened` — in agent mode the browser is not opened; show the link to the person |

The `data_*` events (Data API: `layero data …`) are described in the full
reference.

## `error` codes seen during a deploy

| `code` | when | `next_action` |
|---|---|---|
| `auth_required` | No token in `~/.layero/config.json` or in `LAYERO_TOKEN` | `layero login` or set `LAYERO_TOKEN` |
| `auth_expired` | `user_code` expired (15 min), or the saved token expired (7 days) / was revoked — the API answered 401 | `layero login` again |
| `auth_timeout` | 15 minutes of polling without confirmation | `layero login` again |
| `plan_limit` | Plan limit (API 402) | Upgrade at `app.layero.ru/billing` or delete what is not needed |
| `username_required` | The account has no name chosen (API 412); in agent mode there is nobody to ask | `layero username <name>` |
| `username_rejected` | The name is taken or malformed | Lowercase Latin letters, digits, hyphen, 2–32 characters |
| `oauth_unavailable` | The login provider is unavailable | Later |
| `project_unknown` | Outside a project directory and without `--project` | Run from the project directory or pass `--project <id\|slug>` |
| `project_not_found` | `--project` points at a project that does not exist | `layero projects list` |
| `cli_deploys_disabled` | CLI deploys are switched off in the project | Project Settings → CLI deploys |
| `invalid_type` | Unknown `--type` | Remove the flag or use a valid preset |
| `invalid_choice` | Invalid choice in non-TTY | An explicit flag |
| `branch_unsupported` | `deploy --branch`: an archive always goes to the `cli` environment, the flag gives no preview. Nothing was uploaded | Connect a repository (`projects create --repo`) and push to a branch; for a project with a repository `next_action` says where to push |
| `repo_format` / `account_not_found` / `repo_not_found` / `repo_already_imported` / `source_connect_failed` | `projects create --repo`: format, no connection to the provider, the repository is not visible, already linked, linking failed | `next_action`: `sources list`, `sources connect`, `sources repos`, `link` |
| `provider_unknown` / `token_missing` / `source_rejected` / `connection_not_found` | `sources connect` / `sources repos` | Provider list, `--token-stdin`, the provider's `token_hint`, `sources list` |
| `hook_not_found` | `hooks delete` with someone else's id | `hooks list` |
| `claimable_unavailable` | Deploy without an account is not enabled on the platform | `layero login` or `LAYERO_TOKEN` |
| `sandbox_claimed` | Another `deploy` in a sandbox folder, but the person already took the site into an account; the sandbox token is revoked | Ask the person to sign in with that account (`npx layero@latest login`), then the same `deploy` |
| `sandbox_expired` | Another `deploy` in a sandbox folder, but the hour ran out and the sandbox was deleted; the dead link is removed | New sandbox — `deploy --claim` (with the person's consent); to keep a site — sign in |
| `claim_static_only` | `deploy --claim` (or the automatic mode without a login) in a server app folder — SSR, fullstack, container. Without an account only static sites and SPAs go out; nothing was created or uploaded | Ask the person to sign in (`npx layero@latest login`), then the same `deploy` without `--claim` |
| `claim_with_project` | `deploy --claim --project <project>`: the sandbox creates a new project and does not deploy into an existing one | Existing project — `layero login` and no `--claim`; new site — `--claim` without `--project` |
| `claim_unknown` | No claim for the folder's project (kept in `~/.layero/config.json`), or the code is wrong or expired | Pass the code; a new one — `deploy --claim` |
| `prebuilt_no_dir` / `prebuilt_no_index` | The `--prebuilt` folder was not found / has no `index.html` | `--prebuilt ./dist` with a built `index.html` |
| `deploy_not_started` | The build did not start | Retry; if it repeats — `npx layero@latest diagnose` |
| `deploy_watch_lost` | The CLI lost the build log (network failures in a row); the build keeps running on the platform | Do NOT deploy again: `npx layero@latest deploys list --json`, then `logs --deploy <id>` |
| `deploy_failed` | The build did not reach `ready` | `npx layero@latest diagnose --deploy <id>` (in `next_action`; works without an account too) |
| `deploy_cancelled` | The build was cancelled | — |
| `rollback_noop` | `layero rollback`: the rollback target is already at the live address, nothing changed | A specific one — `layero promote <sha>`; the list — `layero deploys list` |
| `source_not_kept` | `layero source`: the build's sources are no longer kept (uploads are stored 7 days, the live build while it is live) | Tell the person; a new upload stores the folder again |
| `source_in_repository` | `layero source`: the build was made from a repository, the platform keeps no copy; the commit link is in `next_action` | Give the person the commit link |
| `file_exists` | `layero source`: the file already exists | `--out <path>` or `--force` |
| `repeated_failure` | The same error repeats; the platform refused to deploy blindly | Remove the cause; if it is already removed — `--confirm-repeated-failure` |
| `forbidden` | The CI token (`layero_ci_*`) lacks a scope | Issue a token with the required scope |
| `org_unknown` | Several organizations, and the command does not know which one to use | `--org <slug>`; the list — `layero orgs list` |
| `confirmation_required` | The command changes access, and in agent mode there is nobody to confirm; nothing changed | Show the plan to the person and repeat with `--yes` |
| `internal` | Unexpected CLI error | Rerun with `--debug` |

The code of an unsuccessful deploy is built as `deploy_<status>`, and there
are four statuses: `ready`, `building`, `failed`, `cancelled`. In practice only
`deploy_failed` and `deploy_cancelled` occur; the codes `deploy_error` and
`deploy_timed_out` do not exist — do not rely on them.

## Exit codes

| code | class | examples |
|---|---|---|
| 0 | success | |
| 1 | other | `plan_limit`, `forbidden`, `confirmation_required`, `repeated_failure` |
| 2 | login needed | `auth_required`, `auth_expired`, `auth_timeout`, `sandbox_claimed` |
| 3 | not found | `sandbox_expired`, `project_unknown`, `project_not_found`, `org_unknown`, `hook_not_found`, `claim_unknown` |
| 4 | invalid input | `invalid_type`, `prebuilt_no_dir`, `prebuilt_no_index`, `branch_unsupported`, `claim_with_project`, `claim_static_only`, `repo_format`, `token_missing`, `rollback_noop` |
| 5 | remote error | `deploy_failed`, `deploy_cancelled`, `deploy_not_started`, `deploy_watch_lost`, `internal`, `http_5xx` |

## Minimal behaviour block

```text
If user asks to deploy via Layero:
  1. Run: npx layero@latest deploy --dry-run --json
     If "detected".confident is false → do what .next_action says first.
  2. Run: npx layero@latest deploy --json
  3. Parse each stdout line as JSON, route on .event:
     - "auth_required" → render .url as clickable link, keep waiting
     - "ready" → show .url (the live site) to user; it already answers
                 (.edge_ready true). Then stop.
     - "error" → follow .next_action verbatim
  4. Never run `git init`. Never run `npm install -g layero`.
```
