# UNIVERSITY INTEGRATION — INDEPENDENT VERIFICATION (2026-10-25)

Owner: `verifier` (task-3). Scope verified: task-1 (`src/lib/university/**`,
`src/app/api/university/**`, adapter tests/fixtures) and task-2
(`src/app/university/**`, `src/components/university/**`, the api.ts block, the
Worker `SOURCES` line) against `docs/UNIVERSITY-INTEGRATION-CONTRACT.md`.

Method: adversarial test suite `test/university-verification.test.mjs` written
from the contract only, plus direct route-handler invocation, source reading and
`git` evidence. No implementation file was modified by the verifier. All adapter
tests are network-free; the only live command is the optional smoke in §6.

Verdict: **the integration is substantially correct and buildable, but five
contract deviations were reproduced. Two are worth fixing before the Lead signs
off (`V-1` dates, `V-3` `1 поток`), three are lower severity.**

---

## 1. Commands and exact results

| # | Command | Result |
| --- | --- | --- |
| 1 | `npm.cmd run typecheck` | exit **0**, `tsc --noEmit`, no diagnostics |
| 2 | `node --test test/university-adapter.test.mjs` | exit **0** — `tests 32 / pass 32 / fail 0`, 4528 ms |
| 3 | `node --test test/university-verification.test.mjs` | exit **1** — `tests 47 / pass 42 / fail 5`, 6375 ms |
| 4 | `npm.cmd run build` | exit **0** — `✓ Compiled successfully in 4.4s`, 52/52 pages, `/api/university`, `/api/university/schedule`, `/api/university/status` emitted as `ƒ` (dynamic) |
| 5 | `node test/fixtures/fesmu/_live-smoke.mjs` (optional, live) | exit **0** — see §6 |
| 6 | fixture-authenticity check (read-only script) | all 299 fixture hrefs and 22 `area-label`s present verbatim in the saved raw pages |

Exact failing output of command 3 (abridged to the assertion lines):

```
✖ §1.3 every accepted date must be a real calendar date
  AssertionError: 31.02.2026 produced the non-existent date_iso 2026-02-31
✖ §1.3 a card whose only href belongs to another section must not leak that URL
  AssertionError: news feed leaked a foreign section URL: .../press-center/events/meropriyatiya/foreign-event/
✖ §1.4 a stream-titled PDF with a digit-leading filename must not become a course
  AssertionError: «1 поток» ... must not be turned into «1 курс»  1 !== null
✖ §1.4 an empty anchor falls back to the nearest preceding heading before the filename
  AssertionError: actual 'heading' !== expected 'Расписание экзаменов'
✖ §2 the canonical faculty route and its alias behave identically for edge ids
  AssertionError: ...?faculty=: canonical=200 but alias=404
```

Baseline (untouched tree) was typecheck 0 / build 0; both still hold, so the
integration did not break the repository build.

---

## 2. Clause-by-clause result

`PASS` = reproduced by my own test or by direct code/route evidence.
`FAIL` = reproduced deviation (details in §3). `UNREACHABLE` = documented clause
with no reachable input. `CODE-ONLY` = read, not dynamically exercised.

### §1.1 Transport

| Clause | Result | Evidence |
| --- | --- | --- |
| single `fesmuFetch`, HTTPS GET, Chrome/126 UA, `Accept-Language: ru,en;q=0.8` | PASS | captured request options (`fesmu.ts:67-69,198-204`) |
| 12 s timeout, 2 retries, ≤20 s total budget | PASS | 3 attempts on status 0, 1 on 404; budget test (411 ms) |
| ~250 ms backoff | PASS* | measured offsets `0, 257, 758` — linear 250/500 ms, not fixed 250 ms (`fesmu.ts:73,334`), see O-1 |
| `new URL()`-safe, never throws, `{ok,status,body,error}` | PASS | 8 malformed inputs, host guard, transport throws |
| relaxed TLS only for `*.fesmu.ru`, explicit agent, `minVersion TLSv1.2` | PASS | captured `options.agent`; `example.com`, `fesmu.ru.evil.com`, `evil-fesmu.ru`, `192.168.1.1` refused with 0 requests |
| rationale comment present | PASS | `fesmu.ts:16-26` |
| `process.env.NODE_TLS_REJECT_UNAUTHORIZED` untouched | PASS | comment-stripped source: no read, no assignment; only `FESMU_STRICT_TLS` is read |
| `FESMU_STRICT_TLS=1` restores strict verification | PASS | strict agent has no `rejectUnauthorized:false`; live run then fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` |
| no cookie / Authorization / credential on a fesmu request | PASS | 5 headers only; no `auth`, no `cookie`, no token; also plain-http request |
| `runtime="nodejs"`, `dynamic="force-dynamic"` on all three routes | PASS | module exports + build marks the routes `ƒ` |

### §1.2 Cache

| Clause | Result | Evidence |
| --- | --- | --- |
| 30-min TTL, keys `feed:` / `schedule:` / `status` | PASS | `fesmu.ts:78,647,1010,1146` |
| hit before expiry / miss after | PASS | mocked clock: hit at 29:59 (`cached:true`, 1 request), miss at exactly 30:00 (2 requests) |
| stale fallback `cached:true, stale:true` + error, never throws | PASS | feed 404→stale 10 items; faculty 503→stale; live strict-TLS run served 15 stale items |
| each cached payload carries `fetched_at` (ISO) | PASS | `feed.fetched_at` stays `2026-10-25T00:00:00.000Z` across a 29:59 hit |
| each cached payload carries `cache_age_seconds` | PASS* | present on the faculty payload (≈1740 s after 29 min); absent from `Feed` — §2 freezes `Feed` without it (`types.ts:58-66` vs `:140-150`), see O-2 |

### §1.3 Feeds

| Clause | Result | Evidence |
| --- | --- | --- |
| split by `iblock-list-item-wrap` | PASS | cap/order test, malformed-HTML test |
| title: `area-label` → `data-title`/`title`/`alt` → first non-empty `<a>` | PASS | `fesmu.ts:569-585`; entity card |
| empty HTTP 200 → `"Разметка источника изменилась"` | PASS | feed + faculty |
| date: first `dd.mm.yyyy`, `date_iso` | **FAIL** | V-1: impossible calendar days produce impossible ISO dates |
| url `^/press-center/<section>/.../`, skip landing/`#` | **FAIL** | V-2: cross-section href accepted |
| `section` label mapping | PASS | `for-applicants` → «Для абитуриентов», `meropriyatiya` → «Мероприятия» |
| entity decoding (`&nbsp; &quot; &#039; &amp; &laquo; &raquo; &mdash; &ndash; &hellip;`) | PASS | `&hellip;` → U+2026 (valid choice); unknown entities kept verbatim |
| collapse whitespace, trim `·`/dashes | PASS | `cleanText` tests |
| dedupe by URL, source order, cap 30 | PASS | 40 synthetic cards → 30, order preserved |
| missing date → `date=null, date_iso=null` | PASS | `feeds-announcements` + synthetic card |

### §1.4 Schedule

| Clause | Result | Evidence |
| --- | --- | --- |
| 6 faculty units, ids/paths/programs/codes | PASS | `portals.ts:164-219`, overview asserts 6 |
| title: anchor text → link attrs → filename + `title_source` | **FAIL** | V-4: nearest preceding heading is never consulted |
| `course` from title/stem, `null` if unknown, `1 поток` ≠ course | **FAIL** | V-3: title honoured, stem prefix is not |
| `semester` осенний/весенний | PASS | `осен|osen|autumn`, `весн|vesna` (plus `spring`) |
| `stream` `1 поток` / `2 поток` / `поток N` | PASS | 3 forms verified, incl. `поток №3` (the source regex uses `№?`, verified by codepoint, not by the read-tool rendering) |
| `kind` mapping (10 labels) | PASS | all labels from the contract table |
| `kind_label` | PASS | page wording, fallback to the Russian kind label |
| `format` from extension `pdf/doc/docx/xls/xlsx` | PASS | 8 extensions, `.txt`/`.htm`/none dropped |
| drop `192.168.*`/`10.*`/`127.*`/`.tmp`/boilerplate | PASS | also `172.16.*`; `mailto:`, `javascript:` dropped |
| dedupe by resolved absolute URL | PASS | duplicate link × 3 → 1 item |
| sort: course asc (nulls last) → kind order → title | PASS | `1 курс` → `2 курс` → nulls; lectures before credits |
| index `documents` with `type:"document"` | PASS | 6 real documents, `title_source:"page"` |
| empty faculty page is not cached as success | PASS | `ok:false`, `error=PARSE_ERROR`, `cached:false`, 2 upstream calls |

### §1.5 Service status

| Clause | Result | Evidence |
| --- | --- | --- |
| registry fields + categories | PASS | all 6 services, every documented field typed |
| probe HEAD then GET, 6 s, ≤4 concurrent, 15 s budget | PASS* | HEAD→GET fallback on 405; peak concurrency 2–4; 15 s timer path CODE-ONLY (live probe 6017 ms) |
| overview returns `reachable:null, checked_at:null` and never probes | PASS | exactly 4 upstream calls, all GET |
| never reachable without a real HTTP response | PASS | status 0 → `false/null`; 503 → `false/503` |
| status cached 10 min | PASS* | second call performs no request (adapter test); 10-min boundary not re-tested |

### §2 Frozen API shapes

| Clause | Result | Evidence |
| --- | --- | --- |
| overview envelope field-by-field (portal, disclaimer, services, schedule, feeds 3×) | PASS | full type manifest, real fixtures, `cache-control: no-store` |
| `Feed` / `FeedItem` / `Faculty` / `ScheduleItem` / `ServiceStatus` field presence + type | PASS | every field asserted, incl. enum domains |
| `ok:true` + per-section errors on partial failure | PASS | news 503: `ok:true`, only `feeds.news.error` set |
| total upstream failure still parseable, never throws | PASS | all 4 sources dead → 200, `ok:true`, 6 services, 6 faculties, `fetched_at:null`, errors per section |
| `ok:false` "only when nothing at all could be produced" | UNREACHABLE | `getOverview` always returns `ok:true` (`fesmu.ts:1206-1215`); the 500 branch (`route.ts:33-38`) needs an unexpected throw — O-3 |
| `?faculty=` envelope + `source` + `cache_age_seconds` | PASS | `ok`, `faculty` (7 fields), `fetched_at`, `source`, `cached`, `stale`, `cache_age_seconds`, `items`, `error` |
| unknown id → `404 {ok:false,error:"Неизвестный факультет"}` on both routes | PASS | exact JSON compared, `cache-control` present |
| canonical route ≡ alias | **FAIL** | V-5: `?faculty=` (empty) → 200 overview on the canonical route, 404 on the alias |
| `GET /status` and `?status=1` → `{ok,fetched_at,services}` | PASS | both 200, identical shape, probed fields typed |

### §3 Front-end

| Clause | Result | Evidence |
| --- | --- | --- |
| `api.ts` additive helpers only | PASS | `git diff --numstat`: `30 0`; exact endpoint strings asserted |
| `fesmu` added to Worker `SOURCES` | PASS | 1-line diff (`integrations.ts:17`), `other` coerced as documented |
| «Сохранить» on every feed item and schedule row, only with `hasToken()` | PASS* | `FeedList.tsx:142`, `SchedulePanel.tsx:87`, `SaveButton.tsx:14`, `ImportsProvider.tsx:96-98`; runtime rendering NOT exercised |
| «Сохранённое из порталов вуза» + delete + 401/login + inline errors | PASS* | `SavedImports.tsx:64-99,116-124`; `notice` + `try/catch` keep the hub alive |
| Russian copy, Tailwind/`card`/`btn-*`, `lucide-react`, no new npm dep | PASS | `package.json`/lockfile diff empty; icons imported |
| every displayed item links to the source and shows `fetched_at` | PASS | `FeedList.tsx:153`, `SchedulePanel.tsx:264,320`, `page.tsx:99` |

### §4 Non-negotiables

| Clause | Result | Evidence |
| --- | --- | --- |
| no ЕИОС password/login/CAPTCHA/paywall bypass, no iframe, public pages only | PASS | comment-stripped scan of the 5 I/O modules: no `authorization`/`cookie`/`localStorage`/`setHeader`/`password=`; no `iframe` in the hub UI; host guard allows only `fesmu.ru` |
| no new npm dependency, typecheck clean | PASS | deps diff empty, task 1 above |
| tests run under `node --test`, no live network | PASS | all 47 tests offline; live smoke is a separate manual script |
| write scope exclusive per task | PASS* | see §5 — one documentation file is out of scope (O-4) |

### §5 Definition of done

| Item | Result |
| --- | --- |
| 1. `npm run typecheck` clean | PASS |
| 2. `node --test test/university-adapter.test.mjs` green | PASS (32/32) |
| 3. `node --test test/university-verification.test.mjs` | **42/47** — 5 reproduced deviations |
| 4. `npm run build` succeeds | PASS |
| 5. live smoke degrades gracefully | PASS — reproduced live, §6 |

---

## 3. Discrepancies (each with `file:line` and a minimal reproduction)

### V-1 — impossible calendar days become impossible `date_iso` values (medium-low)

`src/lib/university/fesmu.ts:444-454` (`extractDateText`) checks only
`day ≤ 31`, `month ≤ 12`, `year ∈ [2000,2100]`; it never validates the real
calendar.

```js
fesmu.extractDateText("31.02.2026") // → { display: "31.02.2026", iso: "2026-02-31" }
```

Reproduced values: `30.02.2026 → 2026-02-30`, `31.04.2026 → 2026-04-31`,
`29.02.2025 → 2025-02-29` (non-leap), `31.06/09/11.2026` likewise.
Impact: §2 `FeedItem.date_iso` can be a date that does not exist, and
`src/components/university/FeedList.tsx:30` forwards it as `published_at` to
`POST /api/v1/integrations/imports`. My suite also asserts the §2 invariant
"`date_iso` must be a real calendar date" (`checkFeedItem`).

### V-2 — a feed card may adopt another press section's URL (low)

`src/lib/university/fesmu.ts:549` (`FEED_ITEM_PATH` accepts
`news|announce|events` regardless of the feed being parsed) and `:587-605`.

```js
parseFeedItems('<div class="iblock-list-item-wrap" area-label="X">' +
  '<a href="/press-center/events/meropriyatiya/foreign-event/">…</a></div></section>',
  "news", "https://www.fesmu.ru/press-center/news/")
// → [{ url: ".../press-center/events/.../foreign-event/", kind: "news", section: "Мероприятия" }]
```

Contract §1.3 scopes the href to `^/press-center/<section>/…/` of the parsed
feed. The resulting item is internally inconsistent (`kind:"news"` with an
events URL and an events section). No fixture card triggers it, so real impact
is low.

### V-3 — `1 поток` becomes `1 курс` when the file name starts with that digit (medium)

`src/lib/university/fesmu.ts:813-831`: the title-prefix rule is guarded against
`поток` (`:821`) but the **stem** fallback (`:825-829`) is not.

```js
parseScheduleDocuments('<a href="/ucheba/raspisanie/1_potok_osen.pdf">1 поток</a>', facultyUrl)
// → [{ course: "1 курс", course_number: 1, stream: "1 поток", semester: "осенний" }]
```

Contract §1.4: "`1 поток` implies the stream, not the course". The unambiguous
case (title `1 поток`, stem without a leading digit) is correct; only the
digit-leading stem conflicts with the stem-prefix rule.

### V-4 — no "nearest preceding heading" title fallback (low-medium)

`src/lib/university/fesmu.ts:733-743` (`anchorAttrTitle`) and `:795-811`
(`mergeGroupTitle`) inspect only attributes of the link and its inner tags;
`:933-939` then jumps straight to the file name.

```js
parseScheduleDocuments('<h3>Расписание экзаменов</h3><p><a href="/ucheba/raspisanie/heading.pdf"></a></p>', facultyUrl)
// → [{ title: "heading", title_source: "filename" }]   expected: "Расписание экзаменов" / "page"
```

Contract §1.4 explicitly lists "the nearest preceding heading" as a title source
before the file-name fallback. `deriveContext` does scan `<h1-4>` but only for
the `context` field.

### V-5 — the canonical faculty route and its alias answer differently for `?faculty=` (low)

`src/app/api/university/route.ts:26-28` uses `if (facultyId)`, so an empty value
falls through to the overview; `src/app/api/university/schedule/route.ts:17`
forwards `""` to `facultyScheduleResponse`, which 404s
(`src/lib/university/http.ts:20-31`).

```
GET /api/university?faculty=          → 200 (overview)
GET /api/university/schedule?faculty= → 404 {"ok":false,"error":"Неизвестный факультет"}
```

Contract §2 declares the second URL a canonical alias of the first. `?faculty=0`
and `?faculty=lechebnyy` agree; only the empty value diverges.

### Observations (not counted as failures)

- **O-1** §1.1 asks for "250 ms backoff"; the implementation waits
  `250 × attempt` (`fesmu.ts:73,334`), measured `0, 257, 758` ms. Budget and
  attempt count are correct.
- **O-2** §1.2 says every cached payload carries `cache_age_seconds`, while the
  frozen `Feed` (§2) has no such field. Followed §2; noted as contract-internal
  tension, not a code defect.
- **O-3** the overview `ok:false` branch is unreachable by design (see §2 table).
- **O-4** `docs/UNIVERSITY-ADAPTER.md` was written by task-1 outside its declared
  write scope (`src/lib/university`, `src/app/api/university`,
  `test/university-adapter.test.mjs`, `test/fixtures/fesmu`). Documentation only;
  `src/lib/university/fesmu.ts:14` references it.

---

## 4. Write-scope evidence (`git status --short`, tree uncommitted vs `HEAD`)

```
 M src/app/api/university/route.ts          (task-1 scope)
 M src/app/university/page.tsx              (task-2 scope)
 M src/lib/api.ts                           (task-2 scope, +30 / −0)
 M workers/api/src/routes/integrations.ts   (task-2 scope, +1 / −1: SOURCES)
?? docs/UNIVERSITY-ADAPTER.md               ← task-1 artifact, OUTSIDE scope (O-4)
?? docs/UNIVERSITY-INTEGRATION-CONTRACT.md  (Lead's spec)
?? src/app/api/university/schedule/route.ts, src/app/api/university/status/route.ts
?? src/app/university/saved/page.tsx
?? src/components/university/*  (8 files)
?? src/lib/university/*  (4 files)
?? test/fixtures/fesmu/*  + test/university-adapter.test.mjs
```

Everything else untracked (`.zcode/`, `tools/chem/*`, `tools/portals/*`) predates
this workstream and is not part of it. The verifier's only writes are
`test/university-verification.test.mjs` and this file. No implementation file was
edited by the verifier (`git diff` for the four modified files is untouched by
task-3).

Fixture independence: committed fixtures are **verbatim subsets** of the raw
saved pages in `.tmp-fixtures/` (299/299 hrefs, 22/22 `area-label`s found); the
raw pages are 496–559 KB real `fesmu.ru` HTML. Fixtures were therefore not
synthesised to fit the parser, and the fixture-driven counts match the live site
(§6).

---

## 5. What was checked but is not dynamic proof

- The 15 s hard probe budget (`fesmu.ts:76,1093-1108,1133-1143`) is read, not
  stress-tested; the live probe finished in 6017 ms.
- The 10-minute status cache uses the same `readThrough` code path as the
  boundary-tested 30-minute cache; its own boundary is not re-tested.
- §3 UI behaviour is verified by source inspection and by the production build,
  not by rendering the page in a browser.
- The 12 s per-request timeout and the real TLS handshake were not timed.

## 6. Live smoke — actually executed from this runner (2026-10-25T14:14:42Z)

`node test/fixtures/fesmu/_live-smoke.mjs` → exit 0:

```
FAIL plain fetch("https://www.fesmu.ru/") → UNABLE_TO_VERIFY_LEAF_SIGNATURE
OK   overview: 596 ms, services=6 (probed=0)          [fesmu.ts header claimed 638 ms]
OK   feed news: items=15  cached=false stale=false error=none  first date=23.10.2026
OK   feed announcements: items=10 error=none
OK   feed events: items=2 error=none                    date=19.11.2026
OK   schedule index: documents=6 error=none
OK   faculty lechebnyy: 354 ms, items=47 error=none    (fixture-derived count is also 47)
OK   service probes: 6017 ms — portal/eios/schedule/testing/news reachable=true, library=false (6014 ms timeout)
OK   FESMU_STRICT_TLS=1: 15 items served as stale with "Ошибка TLS-сертификата: UNABLE_TO_VERIFY_LEAF_SIGNATURE"
```

This independently confirms the §0/§1.1/§1.5 source facts, graceful degradation,
stale serving on a strict-TLS failure, and that the committed fixtures reflect
the live pages (news 15/10/2, index 6, lechebnyy 47).

## 7. НЕ проверено (explicit)

1. **Browser E2E** of `/university` and `/university/saved` (no browser run; no
   screenshot; only source inspection + build).
2. **Real Cloudflare Worker deploy** — the deployed Worker treating `fesmu` as a
   known source, and the documented coercion to `other` on an old deploy.
3. **Live `POST/GET/DELETE /api/v1/integrations/imports`** with a real MEDBIOHIM
   session: auth, per-user SHA-256 dedup, 50-item cap, `401` state in the UI.
4. **`elib.fesmu.ru`** reachability from any other network (times out here; the
   adapter correctly reports `reachable:false`).
5. **15 s probe budget and 10-min status cache boundaries** under pathological
   hosts (see §5).
6. **Strict-TLS behaviour on a non-fesmu host** — not applicable by design
   (guard rejects the host before any TLS use).
7. **Live pages beyond the saved snapshots** (new/removed documents, markup
   changes after 2026-10-25).
8. **Real 12 s request timeout / TLS handshake timing**.
9. **Accessibility/Russian copy review** of the UI.

## 8. Files produced by task-3

- `test/university-verification.test.mjs` — 47 tests, 42 pass / 5 fail; the 5
  failures are V-1…V-5 above and were left failing on purpose in round 1 (a failing test is
  the reproduction). After the owner's fixes the same file passes 47/47 — see §9;
  no assertion was ever weakened.
- `test/university-verification-round2.test.mjs` — 8 additional adversarial tests
  written by the Lead (round 2, §9).
- `docs/UNIVERSITY-VERIFICATION-2026-10-25.md` — this report.

Reproduce: `node --test test/university-verification.test.mjs`.

## 9. Round 2 — re-verification after the fixes (Lead-run, 2026-10-26)

The `verifier` teammate was asked to re-run its oracle against the fixed tree and
extend it. It failed twice and produced no round-2 output, so the **Lead**
completed round 2. Neither the owner nor the verifier edited the oracle file.

| Command (Lead, frozen tree) | Result |
| --- | --- |
| `npm.cmd run typecheck` | exit 0 |
| `node --test test/university-adapter.test.mjs` | 37/37 (32 + 5 named V-1…V-5 regressions) |
| `node --test test/university-verification.test.mjs` (round-1 oracle) | **47/47** (round 1: 42/47) |
| `node --test test/university-verification-round2.test.mjs` (new, Lead) | 8/8 |
| `node --test test/` | **114/114** |
| `npm.cmd run build` | exit 0; `/university` 12.3 kB static, `/university/saved` static, `/api/university{,/schedule,/status}` dynamic |
| `node test/fixtures/fesmu/_live-smoke.mjs` | exit 0 — news 15 / announce 10 / events 2 / index 6 / lechebnyy 47, 0 internal links; 5/6 services reachable (`elib` timeout); `FESMU_STRICT_TLS=1` → stale 15 + cert error |

`test/university-verification-round2.test.mjs` attacks the *new* code paths
instead of re-running the oracle's assertions:

| Lead round-2 test | Result |
| --- | --- |
| V-1 impossible calendar dates rejected (31.02, 30.02, 29.02.2025, 31.04/06/09/11, 32.01, 00.00.0000, year floor/ceiling); 31.12.2026, 01.01.2000, 29.02.2000, 29.02.2024 accepted | PASS |
| V-1 date inside unrelated prose extracted; absent date → `null` | PASS |
| V-2 a card whose only href is an `events` URL yields 0 news items and parses on the events feed | PASS |
| V-3 stream digit never becomes a course; `3_lech_osen.pdf` → 3 курс/осенний; `2_potok_vesna.pdf` → stream + весенний | PASS |
| V-3 stress: «3 поток, 2 курс» → course 2 (explicit «курс» wins), stream «3 поток» | PASS |
| V-4 empty anchor takes the nearest preceding heading; a heading *after* the anchor is not used; no `"heading"` placeholder | PASS |
| V-5 `?faculty=`, `?faculty=%20`, `?faculty=LF`, `?faculty=nope` → 404 with identical status and error on both the canonical route and the `/schedule` alias | PASS |
| §2 `cache-control: no-store` present on the envelope | PASS |

**V-1…V-5: fixed and independently re-verified.** Round 2 found no new defects.

### Resolved contract ambiguity (supersedes §1.5/§2 checklist wording)

The instruction to make `getOverview` return `ok:false` when every section fails
is **deliberately not implemented**: §2's `ok:false` branch is unreachable in
practice, because the static service registry and the six faculty entries with
their official URLs are real renderable content, so a totally failed refresh is
still a *partial* payload. The overview always returns `ok:true` with per-section
`error` strings, and `assert.equal(body.ok, true)` is the correct reading.

### Still not verified after round 2

1. **Browser E2E / client console** of `/university` and `/university/saved`:
   `bsk_session({action:"start"})` was refused three times with «no browser is
   currently connected (hint: open the browser-skill extension in your browser
   and wait for the popup to show "connected")». The pages compile, answer 200
   from `next dev` and pass the production build, but React rendering, client
   console and the Save/Saved flows were never observed in a browser.
2. Real Cloudflare Worker deploy treating `fesmu` as a known source.
3. Live `/api/v1/integrations/imports` with a real session (auth, per-user dedup, 50-item cap, 401 UI state).
4. `elib.fesmu.ru` from another network.
5. Live pages newer than the 2026-10-25 snapshot; 12 s/15 s/10-min boundaries under a pathological host.