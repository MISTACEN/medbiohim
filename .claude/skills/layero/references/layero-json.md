# `layero.json` — build and runtime configuration in the repository

Read this before you create or edit `layero.json`, and whenever a Layero build
or launch fails. It is written from production data: 1,269 failed builds over
90 days, what caused them, and which of them this file can and cannot fix.

## The one rule

**`layero.json` is an answer to one specific problem: one symptom, one field.
It is never a questionnaire.**

Decide in this order:

1. **Look at the plan first:** `npx layero@latest deploy --dry-run --json`
   (uploads nothing, no login). If `confident` is `false`, the folder is one
   of the shapes detection cannot settle — app in a subfolder, workspace app
   with a neighbour package, custom build script with no framework, a server,
   `frontend/` + `backend/` — and `hint` / `next_action` name it and the fix
   (table "When the folder is not recognised"). Configure that shape **before**
   the first deploy. A deploy that is certain to fail is not a probe, it is a
   wasted build.
2. **Otherwise deploy with no file.** An ordinary single app (Vite, Next,
   Astro, CRA, SvelteKit, Nuxt, plain HTML…) needs nothing.
3. **After a failure**, add exactly the field the symptom table names.

- 84 % of new projects go live on the first build with no file at all.
  Detection already finds the framework, package manager, build script, output
  directory, Node version, start command and port.
- Every field you write **stops being auto-detected and is locked in the
  dashboard**. A value you copied "just in case" becomes a lie the day the
  project changes its bundler.
- About 60 % of failures are not fixable by the file at all: they are fixed
  elsewhere (see "What the file does NOT fix"). Agents that kept editing code
  or the file for a problem that lives outside both produced series of up to
  61 identical failures in a row.

## Procedure when a build or launch fails

1. **Read the real error, not the card.** 13 % of failures show only
   `docker-build: exit code 1` or `command failed: npm run build`. Get the
   log first: MCP `diagnose_deploy` then `deploy_logs`, or
   `npx layero@latest diagnose` / `npx layero@latest logs` (add `--runtime`
   for the output of the running app). Never edit the file from the card
   text alone.
2. **Look at the stage that failed** — it tells you where the fix lives:

   | Stage | Where the fix lives |
   |---|---|
   | `detect` | The *shape* of the app: root folder, project type, `runtime`. Not the code. |
   | `install` | Lockfile and `packageManager` in the repo; then `installCommand`. |
   | `build` | The quoted error line: usually code, sometimes `buildCommand` / `nodeVersion`. |
   | `verify`, `upload` | `outputDirectory`. |
   | `launch` | `startCommand`, `port`, environment variables. |
   | `clone`, `timeout`, `activate` | Platform or source access. Retry once. |

3. **Find the symptom in the table below and change exactly one thing.**
4. **Verify in the build log** (section "How to verify") that the value was
   applied and that the file produced no warnings.
5. **Same failure twice in a row — stop.** Do not deploy a third time. Re-read
   the log and this table; if the class is "not fixed by the file", say so to
   the person and name the action that is. After ten identical failures in a
   row the platform pauses auto-deploys from git, and the CLI demands
   `--confirm-repeated-failure`; that flag is for a person, not for you.

## Symptom → fix

Quoted strings are what you will literally see in the deploy card, CLI event or
build log.

### Fixed by `layero.json`

| Symptom | Fix |
|---|---|
| `собранный сайт не содержит index.html в '.'` · `похоже, раздаётся исходный код репозитория, а не собранный сайт` · `сборка отработала, но папки 'dist' нет. После сборки в каталоге есть: …` · `[output] в 'dist' нет index.html` | `outputDirectory`: the folder that contains `index.html` **after** the build (`dist`, `dist/client`, `dist/<app>/browser`, `.output/public`, `build/client`). The error lists what is on disk — take the path from there. If the project was detected as "Static (no build)" but needs a build, also set `framework` and `buildCommand`. |
| `Сборка НЕ запускалась: проект собирается как статический сайт (фреймворк «static») …` ("the build did NOT run") · the log says `[config] ВНИМАНИЕ: buildCommand из layero.json (…) НЕ выполняется` or `static framework: skipping install/build` | **The build never ran.** `framework: "static"` (from the file, the project settings, or detected because the folder holds html and no known framework) means *no install and no build*; `buildCommand` is not run with it — the error names the command that did not run. For a project with its own build script and no known framework use `"framework": "generic"` together with `buildCommand` and `outputDirectory`. Do not start changing the output path — the path was never the problem. `diagnose` answers `next_actions: ["fix_config"]` here: a retry fails the same way. |
| `npm error Missing script: "build"` · `в package.json нет скрипта «build», а сборка настроена как …. Доступные скрипты: dev, test` · `не знаем, чем собирать этот проект: команда сборки не задана` | `buildCommand` with a script that exists. If the site needs no build at all: `"framework": "static"`. If it is a server or a bot, it is not a static site — see the next row. |
| A Node or Python server is published as a static site (files are served, nothing runs), or the log says `в приложении больше нет серверной части — дальше оно раздаётся файлами, а не работает в контейнере` about a repo that **is** a server | The platform switches between static and container by itself when it recognises the server (Next without `output: 'export'`, Express, Fastify, FastAPI, Flask, Django…). When it does not, declare it: `"runtime": "node_web"` (or `"python_web"`, `"ssr_next"`), `"startCommand": "node dist/server.js"`, and `"port"` if it is not the default. A top-level `runtime` wins over the project type; the log says `the file wins`. One-off alternative without a file: `npx layero@latest deploy -t node_web`. If the app is in fact static, the type is wrong: redeploy with `-t vite` / `-t static`. |
| `launch/boot: container failed to start in time` with `ERR_MODULE_NOT_FOUND /app/…`, a missing entry file, or the app listening on `127.0.0.1` | `startCommand`: path relative to `/app`, a file that exists **after** the build, listening on `0.0.0.0` and `$PORT` — e.g. `uvicorn main:app --host 0.0.0.0 --port $PORT`. Set `port` if the app listens elsewhere (defaults: Node 3000, Next 8080, Python 8000, Streamlit 8501, Gradio 7860). An ASGI app needs `uvicorn`, not `gunicorn app:app`. |
| `ERR_UNKNOWN_BUILTIN_MODULE` · `EBADENGINE` · `Node.js v… ERR_INVALID_PACKAGE_CONFIG` · `Node.js 18 снят с поддержки и закрыт для новых сборок` | `"nodeVersion": "22"`. First look at the log line `[config] node=… (…)`: if `.nvmrc` or `engines.node` already sets the version, fix it there — the file would override them and leave two sources of truth. |
| `npm error code EUSAGE` (lock out of sync) · truncated `npm help ci` output (no lockfile) · `ERR_PNPM_…` | First the repo: commit an up-to-date lockfile and an exact `packageManager`. Only then `installCommand` (`npm install`, `pnpm install --no-frozen-lockfile`). Never write `npm ci` as *your* `installCommand` when there is no lockfile. (With no `installCommand` the platform copes on its own: it runs `npm ci` and falls back to `npm install`; a missing lockfile alone is not a reason to add the key.) |
| `/bin/sh: 1: run: not found` · `-v: not found` | The command is a fragment. Write the whole command: `npm run build`, not `run build`. |
| `Can't resolve '@scope/shared'` in a workspace | Deploy from the **workspace root** (not `--root apps/web`: the neighbour package would not be uploaded) with all three keys — `"framework": "generic"`, `buildCommand` that builds dependencies first (`pnpm --filter @scope/shared build && pnpm --filter @scope/web build`), and `outputDirectory: "apps/web/dist"`. Without `framework` the workspace root is guessed as `static` and the build never runs. Full example: "Minimal examples". `Unsupported URL Type "workspace:"` means the lockfile of the workspace manager was not uploaded — commit it. |
| Frontend and backend in one repository are deployed as a static site only | The full-stack blocks: `frontend` + `backend` (+ `apiPrefix`). See "Full-stack layout". |

### What the file does NOT fix

| Symptom | What fixes it |
|---|---|
| `no app at the repo root, and multiple candidate app folders found (…)` · `root_directory not found in source: 'apps/web'` · `no package.json at the build root` | **The app root is a project setting, not a file key.** `npx layero@latest deploy --root apps/web` (saved on the project) or "Root directory" in the dashboard. There is no `rootDirectory` key. In a monorepo `layero.json` lives **inside the app folder**, not at the repository root. Exception: full-stack halves use `frontend.root` / `backend.root`. |
| `branch 'cli' has no app to build: no package.json / layero.json / requirements.txt found at the deploy root` | `deploy` was run from the wrong folder. `cd` into the app, or pass `--root`. Ready-made static output: `--prebuilt <dir>`. |
| Next.js: `"/app/.next/standalone": not found` · `Next собрал статический сайт… Запустите сборку ещё раз` · `project is configured for SSR, can't deploy as static` | **`next.config`, not the file.** `output: 'export'` means static, no `output` means server. Never set `outputDirectory: ".next"`. "Run the build again" is literal: retry once. If the app is not Next at all (Vite SSR, TanStack Start) the type is wrong — use `"runtime": "node_web"` + `startCommand`. |
| `error TS…` · `Type error:` · `Module not found: Can't resolve '@/…'` · `Failed to compile` · failing tests inside `build` | The code. Reproduce locally with the same command and Node major. A common one: file-name case that macOS forgives and Linux does not. Dropping a build step (`vite build` instead of `tsc -b && vite build`) is allowed only if the owner agrees. |
| `launch/probe: container bound but not servable (5xx)` · `launch/probe: container bound but not servable (no HTTP response)` | Environment, database, code: `GET /` must answer without a 5xx. Variables go to the dashboard or `npx layero@latest env set`, not into the file. A long-polling bot with no HTTP listener cannot pass the launch probe. |
| `supabaseUrl is required` · Prisma `timed out` during build · `Failed to collect page data` | Build-time environment variables of the project. Secrets never go into the file. |
| `builder did not pick up the job after N retries` · `deb.debian.org` · `auth.docker.io … TLS handshake` · `container has no IP in apps network` | Platform. Retry **once** (`retry_deploy`). If it repeats, tell the person to contact support — do not touch the code or the file. |
| `docker-build: timeout after …s` · `Reached heap limit` · `ENOSPC` | Build limits of the plan. `memory_mb` in the file is the memory of the *running container*, not of the build. |
| `хост '…' не в списке разрешённых источников` · `git-fetch: timeout after …s` | Source connection in the dashboard. |

## When the folder is not recognised

`npx layero@latest deploy --dry-run --json` (and the `detected` event of every
deploy) shows how the platform will build the folder, with the source of each
value in `sources`: `layero.json`, `project settings`, `package.json`,
`framework config`, `framework default`. It is advice, not a decision: the
platform detects again on the uploaded files, and the CLI never saves its guess
to the project — only what you name (`--type`, `--root`, `layero.json`, fields
you write into `.layero/project.json`).

`confident: false` means the folder was not recognised. The event then carries
`hint` (what the CLI saw), `next_action` (one concrete step) and `candidates`
(app folders below). The shapes, and what `next_action` points to:

| What is in the folder | What to do |
|---|---|
| The app is in a subfolder (`apps/web`, `frontend/`, `packages/site`) and is **self-contained** (no `workspace:*` / `file:../` dependencies) | `npx layero@latest deploy --root apps/web` — not a file key, see below. With a single app folder the platform picks it by itself as well; `--root` makes it explicit |
| The app is in a subfolder and **depends on a neighbour package** of the workspace (`"@scope/shared": "workspace:*"`) | Deploy from the workspace root with `layero.json` there: `"framework": "generic"` + `buildCommand` that builds the neighbour first + `outputDirectory: "apps/web/dist"` — example below. `--root apps/web` would upload the app without its neighbour |
| `package.json` with a `build` script but no known framework, html only in a source folder | `layero.json`: `"framework": "generic"`, `buildCommand`, `outputDirectory`. Without `generic` the folder is treated as ready-made static files and the build never runs |
| A server with no known framework (`http.createServer`, a `start` script) | `-t node_web` / `-t python_web`, or `layero.json`: `runtime` + `startCommand` |
| `frontend/` and `backend/` side by side | `layero.json` with both blocks — "Full-stack layout"; `next_action` already contains the file |
| The output folder is set by a flag in the build script (`vite build --outDir public_html`) | `layero.json`: `outputDirectory` only. Detection reads config files, not script flags; without the key the platform looks in the framework's default folder and can serve the source `index.html` instead of the build. The CLI names the flag in `hint` |

**Server checklist — `--dry-run` does not read your code.** A recognised
server (`confident: true`) can still fail at `launch`, and the error text
(«Приложение не успело запуститься за 30с», `container failed to start in
time`) does not name the cause. Open the entry file before the first deploy:

1. It listens on `0.0.0.0`, not `127.0.0.1` / `localhost`
   (`app.listen(port, "0.0.0.0")`, `uvicorn --host 0.0.0.0`). This is a code
   change; no `layero.json` key fixes it.
2. It reads the port from `$PORT` (`process.env.PORT`), or `port` in
   `layero.json` names the port it really uses.
3. The start command runs a file that exists **after** the build: a TypeScript
   server starts as `node dist/index.js`, never `node server/index.ts`. If the
   `start` script in `package.json` is wrong, set `startCommand`.

A project created by a CLI older than 0.11 — or imported from a repository by
`projects create --repo` before CLI 0.11.4 or by MCP `import_repo` before
2.3.1 — may carry that tool's guess in its settings; the build log shows it
as `(from hint)` / `(from dashboard)`, and
`--dry-run` shows it with `sources` = `project settings`. `layero.json`
always wins over it.

## What detection already does — leave it alone

- **Framework** of a normal single app (Vite, Astro, Next, SvelteKit, Nuxt,
  CRA, Angular, Docusaurus, VitePress…). Set `framework` only when detection
  was wrong: Storybook next to a Vite app, "Static (no build)" on a project
  that needs a build, "Other".
- **Package manager and install command** from the lockfile (bun → pnpm →
  yarn → npm), manager version from `packageManager`.
- **Build command**: the `build` script. Do not write `npm run build` into the
  file — it is already the default, and writing it locks the field.
- **Output directory** from the repo config (`outDir` in vite.config,
  `outputPath` in angular.json) or the framework default (vite/astro `dist`,
  next export `out`, CRA `build`, nuxt `.output/public`, sveltekit `build`).
- **Node version**: `.nvmrc` → `.node-version` → `engines.node` → default.
- **Next.js mode** (server or export): from `next.config` and the build result.
- **Start command and port** of a runtime app, by type.
- Platform install flags (`--ignore-scripts`, `--no-audit`…) are appended to
  **any** install command and cannot be turned off. Native postinstall builds
  need `pnpm.onlyBuiltDependencies` in `package.json`, not the file.

`{}` is a valid file meaning "detect everything". `$schema` does not affect
the build.

## Keys — the complete list

Only these names exist. **An unknown key does not fail the build: it is
silently skipped with a warning**, and you will believe you configured
something. Seen in production and ignored every time: `static`, `headers`,
`type`, `dir`, `build_cmd`, `output_dir`, `start_cmd`, `install_cmd`,
`rootDirectory`, `framework: "node"`. `type` is the one written by analogy
with the `--type` flag: use `framework` for a framework name and `runtime`
for a container type (`node_web`, `python_web`, …); `deploy --dry-run` warns
about `type` in `layero_warnings` before anything is uploaded.

| Key (short alias) | Applies to | Meaning |
|---|---|---|
| `framework` | build | Framework name; wins over detection. |
| `installCommand` (`install`) | build | Dependency install. For an app that runs in a container it is applied **only to Python** (replaces the `pip install -r requirements.txt` step); **a Node server (`node_web`, `ssr_next`) never executes it** — install is chosen from the lockfile. |
| `buildCommand` (`build`) | build | The whole build command. |
| `outputDirectory` (`output`) | static only | Folder with `index.html` after the build, relative to the app root. **Accepted but never applied for a container app**, and no warning is printed. |
| `nodeVersion` (`node`) | build | Node major, e.g. `"22"`. Overrides `.nvmrc` / `engines`. |
| `runtime` | type | `ssr_next`, `node_web`, `python_web`, `streamlit`, `gradio` (nothing else; `streamlit` / `gradio` require `app.py`): run the app in a container instead of static hosting. At the top level it wins over the project type. |
| `startCommand` (`start`) | runtime only | Command inside the container, relative to `/app`. Does nothing without a runtime. |
| `port` | runtime only | Port the app listens on. The platform sets `$PORT` for the container; an app that listens on `$PORT` needs no `port` key. Write it only when the app ignores `$PORT`. |
| `memory_mb`, `cpu_quota`, `idle_timeout_s`, `preload` | runtime only | Container resources and sleep timeout. |
| `env` | runtime only | **Non-secret** variables for the container app (build and run); a name set here overrides the project variable of the same name. A static build does not read it. The file is committed to git. |
| `layout` | shape | `"fullstack"` declares two halves explicitly when detection did not see them. |
| `frontend` { `root`, `framework`, `install`, `build`, `output`, `node` } | full-stack | The half served as static files. |
| `backend` { `root`, `framework`, `runtime`, `install`, `start`, `node`, `port`, `memory_mb`, `cpu_quota`, `idle_timeout_s`, `preload`, `env` } | full-stack | The half that runs in a container. |
| `apiPrefix` (`api_prefix`) | full-stack | Path prefix routed to the backend, e.g. `"/api"`. |

If both names of one field are present (`build` and `buildCommand`), the
camelCase one wins and the other is reported as a warning. `$schema` and
`ignore` (reserved, does nothing) are also accepted without a warning.

Schema for editors: `"$schema": "https://layero.ru/schema/layero-v2.json"`.

## Minimal examples — one pain, one field

Wrong output folder, nothing else:

```json
{ "outputDirectory": "dist/client" }
```

Detected as "Static (no build)" but it is a Vite app:

```json
{ "framework": "vite", "outputDirectory": "dist" }
```

A Node server that detection treated as a static site:

```json
{ "runtime": "node_web", "startCommand": "node dist/server.js", "port": 3000 }
```

A TypeScript server: the container build installs `devDependencies` and runs
the `build` script, so point `startCommand` at the **compiled** file, never at
`.ts` source. `startCommand` alone is enough when the log already says the
project is a runtime app; add `runtime` when it was published as static files.

```json
{ "runtime": "node_web", "startCommand": "node dist/index.js" }
```

A workspace app that imports a neighbour package (file at the workspace root,
deploy from the workspace root):

```json
{
  "framework": "generic",
  "buildCommand": "pnpm --filter @scope/shared build && pnpm --filter @scope/web build",
  "outputDirectory": "apps/web/dist"
}
```

A FastAPI app with a non-standard entry point:

```json
{ "runtime": "python_web", "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT" }
```

Node version only (and only if the repo has no `.nvmrc` / `engines.node`):

```json
{ "nodeVersion": "22" }
```

### Full-stack layout

Frontend and backend in one repository, API under `/api`:

```json
{
  "frontend": { "root": "frontend", "output": "dist" },
  "backend": { "root": "backend", "framework": "fastapi" },
  "apiPrefix": "/api"
}
```

- **Inside the halves use the short key names** (`root`, `framework`,
  `install`, `build`, `output`, `node`, `start`, `port`). The long names from
  the top level (`buildCommand`, `outputDirectory`, `startCommand`) are not the
  contract there.
- The backend usually needs only `root` and `framework`: for FastAPI, Flask,
  Django, Express the start command and port are derived. Add `start` / `port`
  only when the launch fails.
- Both blocks are required: one block alone does not switch the layout on,
  with or without `"layout": "fullstack"`.
- `root` must be a folder that exists. A half that lives at the repository
  root gets an empty `root` (`"root": ""`, or no `root` at all). The error
  lists the real folders — copy from it.
- Name the backend by `framework` (`fastapi`, `express`, `django`…).
  `backend.runtime` does **not** choose the container type — the project
  setting does, and a mismatch is only reported in the log.
- **`frontend` + `backend` blocks replace the full-stack settings from the
  dashboard entirely.** Blocks with invented keys (`dir`, `build_cmd`,
  `start_cmd`) switch those settings off and give nothing back: a project that
  was building stops building.
  If the project already builds from dashboard settings, do not add the blocks.

## Mistakes inside the file that fail quietly

1. **Invalid JSON** (trailing comma, comments) disables the file **entirely**:
   the build proceeds as if there were no file. A static build prints a
   warning; a container build prints nothing. One project shipped six builds
   in a row this way. Validate before committing.
2. **Questionnaire instead of a fix**: all fields filled with defaults
   (`npm ci`, `npm run build`, `dist`). This is the most common file in
   production and the most useless one; `npm ci` without a lockfile is a
   ready-made failure.
3. **A locked wrong value**: `"output": "."` on a project that builds,
   `"output": ".next"`, `"install": "true"` (executed literally — nothing is
   installed), `"build": ""`. The platform executes what is written and does
   not substitute a better guess.
4. **`outputDirectory` on a container app** and **`startCommand` / `port`
   without `runtime`**: accepted, stored, never used, no warning.
5. **`runtime` that contradicts the project type**: the top-level key wins. If
   that was not the intent, one line changes how the site is served.
   `backend.runtime` inside the full-stack block is the opposite: the project
   setting wins and the key is ignored with a log note.
6. **The file in the wrong place** in a monorepo: it is read from the app
   root, not from the repository root.
7. **Secrets in `env`**: the file is in git.

## File or project settings?

- Use the **file** when the value must travel with the code (every branch,
  every clone) and the owner accepts that the field becomes locked in the
  dashboard.
- Use **project settings** (`--type`, `--root`, dashboard) for a one-off fix,
  for anything the file has no key for, and when you are not the owner of the
  repository conventions.
- Order of precedence, highest first: `layero.json` → project settings → CLI hint (`--type`, `framework_hint` in `.layero/project.json`) →
  repository (`.nvmrc`, `engines`, `packageManager`, config files) → framework
  default.

## How to verify

After every change, find both of these in the build log
(`deploy_logs` / `npx layero@latest logs`):

1. **The applied value**, marked with its source. Static build:
   `[config] framework=vite (from layero.json)`,
   `[config] build=`…` (from layero.json)`,
   `[config] install=`…` (from layero.json)`,
   `[config] output=dist/client (from layero.json)`,
   `[config] node=22.x.y (layero.json)` — the Node line has no "from".
   Any other source means your field was not applied (on a project created by
   a CLI older than 0.11, or imported from a repository by a CLI older than
   0.11.4 or MCP older than 2.3.1, `(from dashboard)` and `(from hint)` can be
   that tool's guess): `(from dashboard)`,
   `(from hint)`, `(auto-detected)`, `(from package.json scripts)`,
   `(from lockfile)`, `(from vite config file)`, `(default for vite)`,
   `(project settings)`, `(.nvmrc)`, `(engines.node)`, `(default)`.
   Container build: `start command: …` (printed without a source — compare
   the text with your `startCommand`), `install command: … (источник: layero.json)` (Python
   only), `env: N from project, N from layero.json`.
   Full-stack: `fullstack: frontend='frontend' backend='backend' api_prefix=/api`
   and `fullstack frontend: install=… build=… output=…` — if these two lines
   are missing, the layout was not recognised.
2. **No warnings from the file.** Any of these means the file did not do what
   you think:
   - `[config] layero.json: unknown keys ignored: …`
   - `[config] layero.json: invalid JSON at line N col N`
   - ``[config] layero.json: `build` must be a non-empty string — ignored``
   - ``[config] layero.json: `buildCommand` и `build` — одно и то же поле; применяется `buildCommand` ``
   - `[config] WARNING: unknown framework '…' (layero.json). Known: …. Auto-detected as '…'.`
   - `layero.json requests runtime '…' while the project is set to '…' — the file wins`
   - `[config] в layero.json объявлен бэкенд «…», но проект настроен как «…» — собираем по настройке проекта`
   - ``[config] layero.json: объявлен `layout: "fullstack"`, но `backend` не описан — раскладка не применится``
   - `[output] в '…' нет index.html. Платформа не подменяет заданный каталог`
   - ``[config] предупреждение: `…` слушает только localhost — контейнер будет недоступен``
   - `[config] node: layero.json перекрыл .nvmrc=…` (informational: you now have two sources)
   - `Фронтенд указан в каталоге …, но такого каталога в репозитории нет` (or `Бэкенд …`; this one fails the build)

**Container apps: `ready` waits for the address.** The CLI (0.11+) emits
`ready` only once the URL answers with the app instead of a platform page
(it waits up to 90 s). `edge_ready: false` in `ready` means the app never came
up — read `npx layero@latest logs --runtime`.

**Lines that look like errors on a successful deploy and are not:**
`smoke: 2 из 3` / `Бэкенд отвечает по /api/ — код 404` (the probe hit a path
your app has no route for; the deploy is judged by the final status, not by
this line), `npm warn config production Use --omit=dev` (a platform install
flag), «сборке фронтенда будут отобраны непубличные переменные … режим warn»
(informational), «статику раздаёт сам контейнер: не нашли, что выгрузить» on
the backend half of a full-stack project (the frontend is uploaded by its own
stage). Do not "fix" them.

Then confirm the result, not the build: `site_status` or `GET` on the address
from the `ready` event. A green build with a red launch is still a failure.
