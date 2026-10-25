# FESMU test fixtures

Real HTML saved from `https://www.fesmu.ru` on **2026-10-25** (Lead probe), then
trimmed so each file stays well under 40 KB. The raw ~0.5 MB pages live outside
version control in `.tmp-fixtures/`; do not commit them.

| File | Content |
| --- | --- |
| `feeds-news.html` | 10 newest real Bitrix cards of `/press-center/news/` (of 15 on the page). |
| `feeds-announcements.html` | All 10 cards of `/press-center/announce/` (no dates on the listing). |
| `feeds-events.html` | Both cards of `/press-center/events/`. |
| `schedule-index.html` | The document `<ul>` of `/ucheba/raspisanie/` plus the internal `http://192.168.2.37/...` nav noise. |
| `faculty-<id>.html` | The real `sf-iblock-detail-area` region of each of the 6 faculty pages + the internal nav noise + the page `<h1>`. |

Trimming removes the site header/footer/base64 noise, collapses runs of
indentation whitespace and strips the embedded GIF data URI — the card, anchor,
table and date markup the adapter parses is kept verbatim.

Regenerate (needs `.tmp-fixtures/`):

```bash
node test/fixtures/fesmu/_build-fixtures.mjs
```

Other helpers in this directory:

* `load-ts.mjs` — ESM loader hook so plain `.mjs` tests/scripts can import the
  real `src/lib/university/*.ts` (transpiles with the project's `typescript`).
* `ts-hook.mjs` — the same hook for Node versions without `module.registerHooks`.
* `_live-smoke.mjs` — manual live check of the adapter against www.fesmu.ru.

Tests: `node --test test/university-adapter.test.mjs` (network-free).
