# UNIVERSITY PORTALS INTEGRATION — FROZEN CONTRACT (2026-10-25)

Owner: lead (Team Lead). This document is the **single source of truth** for the
`/university` integration workstream. Implementers must not change the shapes below
without asking the Lead first.

## 0. Verified facts about the source (probed live 2026-10-25 from this workspace)

Namespace: `https://www.fesmu.ru` (ДВГМУ / ФЕСМУ). Real, verified URLs:

| Purpose | Verified URL |
| --- | --- |
| Main site | `https://www.fesmu.ru/` |
| ЕИОС | `https://eios.fesmu.ru/WebApp/#/` |
| ЕИОС (entry) | `https://eios.fesmu.ru/` |
| Library | `https://elib.fesmu.ru/` |
| Testing | `http://test.fesmu.ru:8080/` |
| Schedule index | `https://www.fesmu.ru/ucheba/raspisanie/` |
| News list | `https://www.fesmu.ru/press-center/news/` |
| Announcements list | `https://www.fesmu.ru/press-center/announce/` |
| Events list | `https://www.fesmu.ru/press-center/events/` |

### 0.1. Bug list found in the current code (must be fixed)

1. **TLS**: `fetch("https://www.fesmu.ru/...")` from Node fails with
   `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (the site does not send the intermediate CA).
   Reproduction: `node -e "fetch('https://www.fesmu.ru/').then(r=>r.text()).then(t=>console.log(t.length)).catch(e=>console.log(e.cause?.code||e.message))"`
   → `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
   The whole adapter therefore returns empty data today.
2. **Wrong feed paths**: code uses `/press-center/announcement/` and
   `/press-center/event/`. Both answer `HTTP 200` with an **empty 9-byte body** →
   announcement/event feeds are permanently empty. Correct: `announce/` and `events/`.
3. **Wrong faculty paths**: code uses `/ucheba/raspisanie/lf/|pf/|bf/|smf/` (404/empty).
   Verified real paths are in the table below (6 units, not 4).
4. **Broken URL join**: `https:${href.startsWith("//") ? href : `://${host}${href}`}`
   breaks for relative hrefs without a leading slash and for protocol-relative.
   Use `new URL(href, baseUrl).toString()` (see also `http://192.168.2.37/...` links that
   must be dropped — internal RFC1918 host, not reachable publicly).
5. **No cache** although the UI shows «кэш 30 мин» and docs claim a 30-minute server cache.
   `cached` is never set to `true`.
6. **News parser is wrong**: `/<a ... href="...(press-center|news)..."[^>]*>([^<]+)<\/a>/`
   returns navigation links («Для абитуриентов», «Для студентов») and empty titles for
   image cards, and never extracts dates. Verified real markup is a Bitrix card
   (see §1.3).
7. **Page shows 4 faculties** while the schedule index links 6 units.
8. `/api/university` ignores non-faculty documents on the schedule index
   («график учебного процесса», «график вступительных», «график вручения дипломов»).

### 0.1.1. Status of the §0.1 bug list (audit 2026-10-28, offline verification)

All 8 defects above are fixed in the current tree and verified offline
(`npx tsc --noEmit` clean; `node --test` — adapter 37/37, round-1 oracle 47/47,
round-2 8/8). Item-by-item:

1. **TLS** — mitigated in code per §1.1 (relaxed `node:https` agent for
   `*.fesmu.ru` only, rationale comment, `FESMU_STRICT_TLS=1` restores strict
   verification). The **root cause is infrastructural and remains OPEN on the
   university side**: `www.fesmu.ru` still does not send its intermediate CA, so
   plain `fetch`, browsers with a cold chain cache or any strict-TLS environment
   will still fail. "It works from the adapter" is a mitigation, not a fix of
   the server configuration.
2. Feed paths — `portals.ts` uses the verified `news/`, `announce/`, `events/`.
3. Faculty paths — `FACULTIES` carries the six verified §1.4 paths.
4. URL join — `resolveUrl()` is `new URL()`-based and drops RFC1918 hosts.
5. Cache — `readThrough()` implements the 30-min TTL with stale fallback and
   `fetched_at`/`cache_age_seconds` on every payload.
6. News parser — Bitrix card parser per §1.3 (incl. V-1/V-2 hardening).
7. The hub serves all 6 faculty units.
8. Index-page `documents` are extracted with `type: "document"`.

## 1. Adapter requirements

### 1.1. Transport

- A single helper `fesmuFetch(url)` in `src/lib/university/fesmu.ts`:
  - HTTPS GET, `User-Agent: Mozilla/5.0 (... Chrome/126 ...)`, `Accept-Language: ru,en;q=0.8`;
  - timeout ~12 s, **2 retries** with 250 ms backoff, total budget ≤ 20 s;
  - `new URL()`-safe, never throws — returns `{ ok, status, body, error }`.
- TLS: `www.fesmu.ru` fails certificate verification. Solve **only** for the
  `*.fesmu.ru` hosts with an explicit `node:https` agent:
  `new https.Agent({ keepAlive: true, rejectUnauthorized: false, minVersion: "TLSv1.2" })`.
  Rationale comment required in the file: certificate chain of the university site is
  incomplete; we only read public pages; no credentials, no cookies, no auth are sent.
  Do **not** set `process.env.NODE_TLS_REJECT_UNAUTHORIZED` and do not relax TLS for
  any other host. Expose the switch as `FESMU_STRICT_TLS=1` to restore strict
  verification.
- Only `GET` public HTML. Never send cookies, tokens, or ЕИОС credentials.
- Works on the Next.js Node runtime (`export const runtime = "nodejs"` on routes,
  `export const dynamic = "force-dynamic"`).

### 1.2. Cache

- Module-level in-memory TTL cache, `ttl = 30 * 60 * 1000`, keyed by
  `feed:<kind>` / `schedule:<facultyId>` / `status`.
- Also a **stale fallback**: if a refresh fails, serve the last good value with
  `cached: true`, `stale: true` and `error` describing the failure (never throw to the UI).
- Each cached payload carries `fetched_at` (ISO) and `cache_age_seconds`.

### 1.3. Feeds (`news` | `announcements` | `events`)

Verified markup (Bitrix template):

```html
<div class="iblock-list-item-wrap h-100 d-flex w-100" area-label="TITLE">
  ...
  <p class="t--1 c-text-secondary mb-2 d-inline-block mr-3"><i class="far fa-calendar-alt ..."></i> 22.10.2026</p>
  <a ... href="/press-center/news/for-applicants/slug/">TITLE</a>
```

Parsing rules:
- split the HTML into item blocks by `iblock-list-item-wrap`;
- title: `area-label="..."` of the block; fall back to `data-title`, `title`, `alt`
  attributes, then to the first `<a>` inside the block with non-empty text;
- date: first `dd.mm.yyyy` inside the block (the `fa-calendar-alt` paragraph);
- url: first `href` inside the block matching `^/press-center/<section>/…/` (skip
  category landing pages with a single path segment, skip `/#`);
- `section`: last URL segment of the category `^/press-center/(news|announce|events)/([^/]+)/` when present
  (`for-applicants`, `for-students`, `for-teacher`) mapped to a Russian label;
- decode HTML entities (`&nbsp; &quot; &#039; &amp; &laquo; &raquo; &mdash; &ndash; &hellip;`),
  collapse whitespace, strip trailing `·`/dashes;
- dedupe by URL; keep source order; cap at 30 items; derive `date_iso` (`YYYY-MM-DD`).
- If zero items are parsed but HTTP 200 → `error: "Разметка источника изменилась"`.

### 1.4. Schedule

Faculty units (verified path → id):

| id | title | program | code | path |
| --- | --- | --- | --- | --- |
| `lechebnyy` | Лечебный факультет | Лечебное дело 31.05.01 | лф | `/ucheba/raspisanie/lechebnyy-fakultet-31-05-01-lechebnoe-delo/` |
| `pediatricheskiy` | Педиатрический факультет | Педиатрия 31.05.02 | пф | `/ucheba/raspisanie/pediatricheskiy-fakultet-31-05-02-pediatriya/` |
| `stomatologicheskiy` | Стоматологический факультет | Стоматология 31.05.03 | сф | `/ucheba/raspisanie/stomatologicheskiy-fakultet-31-05-03-stomatologiya/` |
| `farmatsii` | Факультет фармации и биомедицины | Фармация 33.05.01 | фф | `/ucheba/raspisanie/fakultet-farmatsii-i-biomeditsiny-33-05-01-farmatsiya/` |
| `mediko-gumanitarnyy` | Медико-гуманитарный факультет | — | мгф | `/ucheba/raspisanie/mediko-gumanitarnyy-fakultet/` |
| `kolledzh` | Медико-фармацевтический колледж | СПО | — | `/ucheba/raspisanie/mediko-farmatsevticheskiy-kolledzh/` |

Per document extracted from a faculty page:
- `title` — anchor text (decoded, whitespace-collapsed). If the anchor text is empty,
  look at the nearest preceding heading/`data-title`/`title` attribute on the same link;
  if still empty, derive a human title from the file name (`_`, `-` → spaces, drop
  numbers-only tokens, keep the `.pdf` stem) and mark `title_source: "filename"`.
- `course` (Russian, e.g. `3 курс`) + `course_number` (int, nullable) — from the title
  (`1 курс`, `1-й курс`, leading `3.` / `3_` / `3-`, `1 поток` implies the stream, not the course)
  or from the file stem prefix (`^(\d+)`), but **never** invent it: `null` if unknown.
- `semester`: `"осенний"` when the title/stem matches `осен|osen|autumn`, `"весенний"` when
  `весна|весн|vesna`; else `null`.
- `stream`: `1 поток` / `2 поток` / `поток N` → `"1 поток"`, else `null`.
- `kind` ∈ `lectures | classes | exams | practice-exams | credits | debt | gia | diploma | process-graph | other`,
  mapped from the Russian title:
  `Лекции` → lectures, `Занятия` / `Занятия и лекции` → classes, `Экзамены` → exams,
  `Экзамены по практике` / `Зачеты по практике` / `Зачет по практике` → practice-exams,
  `Зачеты` → credits, `Ликвидация академической задолженности` → debt,
  `ГИА` → gia, `График вручения дипломов` → diploma.
  Keep the Russian label too as `kind_label`.
- `format` from the extension: `pdf | doc | docx | xls | xlsx`.
- Drop: links to `192.168.*`, `10.*`, `127.*`, `.tmp`, and known non-study boilerplate
  (`Образовательный кредит`, `Правила внутреннего распорядка`, «Информирование вузов»).
- Dedupe by resolved absolute URL (the same PDF is often linked 2–3 times by an image +
  caption + title, e.g. «Ликвидация академической … задолженности»).
- Sort: course number asc (nulls last), then kind order as listed above, then title.
- `documents` on the overview = global documents from the schedule index page
  (`график учебного процесса`, `график вступительных испытаний`, `график вручения дипломов`,
  etc.), same item shape, `type: "document"`.

### 1.5. Service status

`services` is a static registry (§0 table) enriched with a live probe (HEAD then GET,
6 s timeout, TLS relaxed for `*.fesmu.ru`):
`{ id, title, url, category, description, badge, reachable: boolean|null, http_status: number|null, latency_ms: number|null, checked_at: string|null, note: string }`.
`category` ∈ `portal | lms | schedule | library | testing | news`.
Probing must never block the overview: overview returns the registry with
`reachable: null, checked_at: null`; the dedicated `?status=1` / `/api/university/status`
endpoint performs the probes (cached 10 min). Never report a service as reachable
without a real HTTP response.

## 2. Frozen API contract (Next.js route handlers in `src/app/api/university/`)

All responses are JSON, `cache-control: no-store`.

### `GET /api/university`
```ts
{
  ok: true,
  fetched_at: string,            // ISO
  portal: { name, url, eios_url, testing_url, library_url, schedule_url, news_url, announcements_url, events_url },
  disclaimer: string,
  services: ServiceStatus[],     // reachable = null (probe lives on the status endpoint)
  schedule: {
    index_url: string,
    note: string,
    faculties: Faculty[],        // 6 items from §1.4
    documents: ScheduleItem[],   // global graphics/documents from the index page
    cached: boolean, stale: boolean, fetched_at: string|null, error: string|null
  },
  feeds: {
    news: Feed, announcements: Feed, events: Feed
  }
}
```
`Feed = { source, label, items: FeedItem[], error: string|null, cached: boolean, stale: boolean, fetched_at: string|null }`.
`FeedItem = { title, url, date: string|null ("dd.mm.yyyy"), date_iso: string|null, section: string|null, source, kind }`.
`Faculty = { id, slug, title, short, program, code, url }`.
`ScheduleItem = { title, title_source: "page"|"filename", url, course, course_number, semester, stream, kind, kind_label, format, context, is_debt }`.

Partial failure must not fail the whole response: `ok: true` with per-section
`error` strings; `ok: false` only when nothing at all could be produced.

### `GET /api/university?faculty=<id>` (and canonical alias `GET /api/university/schedule?faculty=<id>`)
```ts
{ ok: boolean, faculty: Faculty, fetched_at: string, source: string,
  cached: boolean, stale: boolean, cache_age_seconds: number|null,
  items: ScheduleItem[], error: string|null }
```
Unknown id → `404 { ok:false, error:"Неизвестный факультет" }`.

### `GET /api/university/status`
```ts
{ ok: true, fetched_at: string, services: ServiceStatus[] }
```
Probe all services in parallel with a bounded concurrency (≤ 4) and a hard 15 s budget.

## 3. Front-end addition: saving university materials into MEDBIOHIM

Existing Worker API (already deployed, do not break):
- `POST /api/v1/integrations/imports` body `{ items: [{ title, url, kind, source, summary?, published_at? }] }`
  (≤ 50 items) → `{ ok:true, data:{ imported, skipped, items } }`; dedup is SHA-256(url) per user.
- `GET /api/v1/integrations/imports` → `{ ok:true, data:{ items: [{ id, key, title, url, kind, source, imported_at, summary? }], count } }`
- `DELETE /api/v1/integrations/imports/:id`
- `kind` ∈ `announcement | event | document | topic | link`; `source` ∈ `eios | neofamily | sechenov | other`.
- Add `fesmu` to `SOURCES` in `workers/api/src/routes/integrations.ts` (additive; if the
  Worker is not redeployed the server coerces it to `other`, so the UI must tolerate that).

Front-end requirements:
- `src/lib/api.ts`: add `integrationImports()`, `integrationImport(items)`,
  `integrationImportDelete(id)` following the existing `api<T>()` helper style,
  plus small typed helpers. Do not restructure existing exports.
- On `/university`, every feed item and every schedule document gets a **«Сохранить»**
  action (single item → `items:[…]`), visible only when `hasToken()`.
- A section «Сохранённое из порталов вуза» on `/university` listing imports
  (`GET`), with per-item delete and an empty/`401` state that explains the login need.
- Import calls must stay optional: any failure shows an inline message and never
  breaks the hub.
- Russian UI copy, existing Tailwind/`card`/`btn-*` classes, `lucide-react` icons,
  no new npm dependencies.

## 4. Non-negotiables

- No ЕИОС password storage, no server-side login, no CAPTCHA/2FA/paywall bypass,
  no ЕИОС iframe, no scraping of authenticated pages. Public pages only.
- Every displayed item keeps a link to the primary source and shows `fetched_at`.
- No new npm dependencies. TypeScript strict-compatible (`npm run typecheck` clean).
- Tests must run with `node --test` and must not depend on live network access:
  HTML fixtures go into `test/fixtures/fesmu/`.
- Write scope is exclusive per task; do not edit files outside your task scope.

## 5. Verification / definition of done

1. `npm run typecheck` → clean.
2. `node --test test/university-adapter.test.mjs` → green (fixture-driven parser tests:
   feeds with dates/sections, entity decoding, absolute URL resolution, dedupe,
   faculty document classification, cache hit/stale behaviour).
3. `node --test test/university-verification.test.mjs` → independent adversarial suite.
4. `npm run build` → succeeds (Lead-run at the end on the frozen tree).
5. Live smoke (may be blocked by network/TLS from the runner): the adapter must
   degrade gracefully with an explicit error instead of throwing or hanging.
