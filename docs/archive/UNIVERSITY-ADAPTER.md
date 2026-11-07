# UNIVERSITY ADAPTER — implementation notes (task-1)

Implementation of `docs/UNIVERSITY-INTEGRATION-CONTRACT.md` §1/§2 for the
`/university` hub. Owner: `fesmu-core`. Shapes in §2 are implemented verbatim;
this file documents the values chosen for fields the contract names but does not
define, plus the two additive extensions and the verification helpers.

## Files

| File | Purpose |
| --- | --- |
| `src/lib/university/types.ts` | Frozen types (§2). |
| `src/lib/university/portals.ts` | Portal URLs, service registry, 6 faculty units, labels, disclaimer. Pure data, no I/O. |
| `src/lib/university/fesmu.ts` | Transport (relaxed TLS for `*.fesmu.ru`), 30-min TTL cache + stale serving, feed/document parsers, service probes, payload builders. |
| `src/lib/university/http.ts` | Shared `no-store` JSON envelope helpers for the route handlers. |
| `src/app/api/university/route.ts` | Overview, `?faculty=`, `?status=1`. |
| `src/app/api/university/status/route.ts` | Dedicated service probes. |
| `src/app/api/university/schedule/route.ts` | Canonical alias of `?faculty=`. |

## Transport and TLS

* `fesmuFetch(url)` accepts **only** `*.fesmu.ru` (`http` or `https`); anything
  else returns `{ ok: false, error: "Разрешены только домены fesmu.ru" }` without
  opening a socket. Redirects are followed (≤3) only when they stay on fesmu.ru.
* Public HTTPS is read with an explicit
  `https.Agent({ keepAlive: true, rejectUnauthorized: false, minVersion: "TLSv1.2" })`
  because the university does not send its intermediate CA
  (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). `process.env.NODE_TLS_REJECT_UNAUTHORIZED`
  is never touched, and no other host can reach that agent.
* `FESMU_STRICT_TLS=1` restores strict verification for every request.
* Requests carry only `User-Agent`, `Accept`, `Accept-Language`,
  `Accept-Encoding`, `Connection`. Never cookies, `Authorization`, tokens or
  ЕИОС credentials; only `GET`/`HEAD` of public HTML.
* 12 s per attempt, 2 retries (250/500 ms backoff), ≤20 s total; never throws.
  `gzip`/`deflate`/`br` bodies are decompressed with `node:zlib`.

## Cache (contract §1.2)

Keys `feed:<kind>`, `schedule:<facultyId>`, `schedule:index`, `status`.
TTL 30 min (probes 10 min). A failed refresh serves the last good value with
`cached: true, stale: true` and the failure in `error`; `fetched_at` always
describes the original successful read. First-load failures return `ok: false`
with empty items and a Russian error string.

**Additive extension:** every route also accepts `?refresh=1`, which bypasses the
fresh-cache branch (used by the UI «Обновить» button). Without it a manual
refresh would keep showing cached data. Stale-serving still applies.

## Field semantics chosen by the implementer

* `Faculty.slug` — last path segment of the verified schedule URL;
  `Faculty.short` — compact label («Лечебный»); `Faculty.code` — the Russian
  abbreviation from the §1.4 table (`лф`…`мгф`, `null` for the college, which the
  table shows as «—»); `Faculty.program` — the §1.4 program cell (`null` for
  медико-гуманитарный, `СПО` for the college).
* `FeedItem.kind` — the feed it came from (`news`/`announcements`/`events`);
  `FeedItem.source` — the list URL. For the worker import API (§3) map
  `news → topic`, `announcements → announcement`, `events → event`.
* `ScheduleItem.type` — set to `"document"` only on the global schedule-index
  documents required by §1.4; faculty items leave it `undefined`.
* `ScheduleItem.title_source` — `"page"` for anchor text/`data-title`/`title`/
  `alt`/`aria-label`, `"filename"` only when the page carries no usable text.
* `ScheduleItem.kind_label` — the Russian wording of the title with the
  course/stream/semester fragments removed; falls back to the kind label.
* `ScheduleItem.context` — the schedule table row the document belongs to
  («Осенний семестр 2026-2027») or the nearest preceding heading; never invented.
* `course`/`course_number` follow the contract's source list strictly: the title
  (`N курс`, `N-й курс`, leading `N.`/`N_`/`N-`) or the file-stem prefix
  (`^(\d+)`); otherwise `null`. The course column of the schedule table is *not*
  used, because §1.4 enumerates only those two sources. `1 поток` is treated as a
  stream, never as a course. Values outside 1…9 are rejected (so `"31.05.01"` or
  a year can never become a course).
* `semester` — `осенний` for `осен|osen|autumn`, `весенний` for `весн|vesna`.
  `stream` also recognises the transliterated `potok` and the `№ N` / `No N`
  forms found in file names.
* Dates are validated against the real calendar (leap years included): an
  impossible day such as `31.02.2026` yields `date: null, date_iso: null`
  instead of leaking a non-existent date into `published_at` (V-1).
* Feed cards only accept a href of the *parsed* section
  (`news → /press-center/news/…`, `announcements → …/announce/…`,
  `events → …/events/…`), so a foreign URL can never appear with the wrong
  `kind`/`section` (V-2).
* A file name whose leading digits are followed by `поток`/`potok` is a stream,
  never a course (`1_potok_osen.pdf` → stream «1 поток», course `null`; V-3).
* Title fallback order for an anchor with no text at all: nearest preceding
  `h1`–`h4` heading or table caption inside the same section, then the cleaned
  file name with `title_source: "filename"` (V-4). A placeholder word is never
  emitted as a title.
* `?faculty=` with an empty value is a *present* unknown id → `404` on both the
  canonical route and its `/schedule` alias (V-5).
* Dedupe by resolved absolute URL; fragments of the same document are merged
  («Ликвидация академической» + «задолженности» → one full title; a `<br>` or
  whitespace between anchors is a word boundary, an immediate continuation such
  as `практик`+`е` or `2026`+`-27 уч.года` is concatenated).
* Missing dates are normal: announcements list cards currently carry no
  `dd.mm.yyyy`, so `date`/`date_iso` stay `null` and `error` stays `null`.
  `error: "Разметка источника изменилась"` is used only when HTTP succeeded but
  zero items were parsed.
* Service registry: 6 services (`portal`, `eios`, `schedule`, `library`,
  `testing`, `news`). Announcements/events are feeds, not services. The overview
  never probes (`reachable: null`); only `/api/university/status` (or
  `?status=1`) does, with HEAD→GET, 6 s per request, ≤4 parallel, 15 s budget.
  `reachable` requires a real 2xx/3xx answer; timeouts/refusals are `false`.

## Verification

* `npm.cmd run typecheck` — clean (exit 0).
* `npm.cmd run build` — succeeds; `/api/university`, `/api/university/schedule`
  and `/api/university/status` are emitted as dynamic server routes.
* `node --test test/university-adapter.test.mjs` — 37 fixture tests (32 + the
  V-1…V-5 regressions), network-free, including the three route handlers (status
  codes, `cache-control: no-store`, 404 envelope) via `next/server`.
* `node --test test/university-verification.test.mjs` — the verifier's
  independent oracle: 47/47 green.
* The §2 `ok:false` overview branch is intentionally unreachable: when every
  upstream section fails the payload still carries the portal registry, the six
  faculty entries, the disclaimer and the per-section `error` strings, which is
  real renderable content, so a fully-failed refresh is always *partial*
  (`ok:true`, no top-level `error` field — confirmed with the Lead).
* `node test/fixtures/fesmu/_live-smoke.mjs` — manual live check (network).

### Live smoke transcript (2026-10-25, Node 26.8.1, from this workspace)

```
FAIL plain fetch("https://www.fesmu.ru/") → UNABLE_TO_VERIFY_LEAF_SIGNATURE
OK   overview: 638 ms, services=6 (probed=0)
OK   feed news: items=15 cached=false stale=false error=none first="Студенческий научный кружок …" date=23.10.2026
OK   feed announcements: items=10 cached=false stale=false error=none date=null
OK   feed events: items=2 cached=false stale=false error=none date=19.11.2026
OK   schedule index: documents=6 cached=false error=none
OK   faculty lechebnyy: 601 ms, items=47 cached=false error=none
     debt documents: 2, internal links kept: 0
OK   service probes: 6018 ms
     portal    reachable=true  status=200  latency=  430 ms
     eios      reachable=true  status=200  latency=   58 ms
     schedule  reachable=true  status=200  latency=  341 ms
     library   reachable=false status=null latency= 6015 ms   (elib.fesmu.ru times out)
     testing   reachable=true  status=200  latency= 3575 ms
     news      reachable=true  status=200  latency=  346 ms
OK   FESMU_STRICT_TLS=1: error=Ошибка TLS-сертификата: UNABLE_TO_VERIFY_LEAF_SIGNATURE
     (cached feed served as stale — never throws)
```

Counts match contract §0/§1.3/§1.4 exactly (15/10/2 press cards, 6 global
documents, 6 faculty units, 0 internal RFC1918 links kept).

`test/fixtures/fesmu/load-ts.mjs` lets any `.mjs` test or script import the real
TypeScript sources without a build step (it transpiles with the project's
existing `typescript` dev dependency and resolves `./x` and `@/x`):

```js
import { loadUniversityTs } from "./fixtures/fesmu/load-ts.mjs";
const fesmu = await loadUniversityTs("fesmu.ts");
fesmu.setFesmuTransportForTests(async (url) => ({ ok: true, status: 200, body: html, error: null }));
```

`setFesmuTransportForTests(fn)` replaces the single-attempt transport (retries,
budget and host guard stay in the real code); pass `null` to restore it.
`clearFesmuCache()` resets the module cache between tests.

## Known limitations

* `elib.fesmu.ru` opens a connection but times out from this machine; its probe
  reports `reachable: false` with a timeout note.
* College schedule file names are transliterated (`SO1_MFK_ekz_osen.pdf`), so a
  leading-digit course cannot always be derived; `course` stays `null` per the
  strict §1.4 rule even though the title/table would allow a guess.
* The adapter never downloads documents and never follows links outside fesmu.ru.
