/**
 * INDEPENDENT ADVERSARIAL VERIFICATION SUITE — task-3 (verifier).
 *
 * Owner: verifier. This file was written without reading the implementation's
 * own test expectations first: every assertion below is derived from
 * `docs/UNIVERSITY-INTEGRATION-CONTRACT.md` (§1 adapter, §2 frozen API shapes,
 * §4 hard rules) and probes behaviour the author may have missed: malformed
 * HTML, duplicate links, protocol-relative/bare-relative hrefs, private and
 * boilerplate links, broken dates, entity decoding, TTL boundaries, stale
 * serving, 404 semantics, response shapes and credential leakage.
 *
 * Network-free by construction:
 *   - parser tests feed synthetic HTML to the pure functions;
 *   - transport tests replace `setFesmuTransportForTests`;
 *   - the TLS / header-inspection tests patch `node:https.request` and
 *     `node:http.request` with a fake request object, so no socket is opened.
 *
 * Run: node --test test/university-verification.test.mjs
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import test, { mock } from "node:test";
import { loadUniversityTs } from "./fixtures/fesmu/load-ts.mjs";

const fesmu = await loadUniversityTs("fesmu.ts");
const portals = await loadUniversityTs("portals.ts");

const FACULTY = portals.FACULTIES[0]; // lechebnyy
const BASE = "https://www.fesmu.ru/ucheba/raspisanie/";
const FIXTURES = new URL("./fixtures/fesmu/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");

/* ------------------------------------------------------------------ *
 * Transport harness
 * ------------------------------------------------------------------ */

function transportFrom(routes, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const handler = routes[url];
    if (handler === undefined) return { ok: false, status: 0, body: "", error: "NO_ROUTE" };
    if (typeof handler === "function") return handler(url, init);
    return { ok: true, status: 200, body: handler, error: null };
  };
}

function install(routes, calls) {
  fesmu.setFesmuTransportForTests(transportFrom(routes, calls));
}

function cleanup() {
  fesmu.setFesmuTransportForTests(null);
  fesmu.clearFesmuCache();
  try {
    mock.timers.reset();
  } catch {
    /* timers were not mocked */
  }
  delete process.env.FESMU_STRICT_TLS;
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

function fixtureRoutes() {
  const routes = {
    [portals.FEED_SOURCES.news]: fixture("feeds-news.html"),
    [portals.FEED_SOURCES.announcements]: fixture("feeds-announcements.html"),
    [portals.FEED_SOURCES.events]: fixture("feeds-events.html"),
    [portals.SCHEDULE_INDEX_URL]: fixture("schedule-index.html"),
  };
  for (const faculty of portals.FACULTIES) routes[faculty.url] = fixture(`faculty-${faculty.id}.html`);
  return routes;
}

function docsFrom(links, base = FACULTY.url) {
  const html = links.map(([href, text = "", extra = ""]) => `<a href="${href}"${extra}>${text}</a>`).join("\n");
  return fesmu.parseScheduleDocuments(html, base);
}

function byUrl(items, suffix) {
  return items.find((item) => item.url.endsWith(suffix));
}

/* ------------------------------------------------------------------ *
 * §1.1 Transport: credentials, TLS scope, retries, host guard
 * ------------------------------------------------------------------ */

/** A fake `ClientRequest` that answers 200 with an empty body. */
function fakeRequestFactory(captured, script) {
  return (options, callback) => {
    captured.push(options);
    const step = typeof script === "function" ? script(options, captured.length) : script?.[captured.length - 1];
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = step?.status ?? 200;
      response.headers = step?.headers ?? {};
      response.resume = () => {};
      process.nextTick(() => {
        callback(response);
        if (step?.body) response.emit("data", Buffer.from(step.body));
        response.emit("end");
      });
    };
    return request;
  };
}

test("§1.1 a fesmu GET sends no cookie / Authorization / credential at all", async () => {
  const captured = [];
  const originalHttps = https.request;
  const originalHttp = http.request;
  const script = () => ({ status: 200, body: "<html></html>" });
  https.request = fakeRequestFactory(captured, script);
  http.request = fakeRequestFactory(captured, script);
  try {
    const over = await fesmu.fesmuFetch("https://www.fesmu.ru/press-center/news/");
    assert.equal(over.ok, true);
    const plain = await fesmu.fesmuFetch(portals.PORTAL.testing_url); // http://test.fesmu.ru:8080/
    assert.equal(plain.ok, true);
    assert.equal(captured.length, 2, "one https + one plain http request expected");

    for (const options of captured) {
      const headerNames = Object.keys(options.headers).map((name) => name.toLowerCase());
      for (const forbidden of ["cookie", "authorization", "proxy-authorization", "x-eios-token", "token", "x-auth-token"]) {
        assert.equal(headerNames.includes(forbidden), false, `header "${forbidden}" must never be sent to a fesmu host`);
      }
      assert.equal("auth" in options, false, "node:http `auth` option (user:password) must never be set");
      assert.equal(options.headers["User-Agent"].includes("Chrome/126"), true);
      assert.equal(options.headers["Accept-Language"], "ru,en;q=0.8");
      assert.equal(options.method, "GET");
    }
    // Relaxation is per-request and https-only: plain http carries no agent.
    assert.ok(captured[0].agent instanceof https.Agent, "https fesmu request must use an explicit agent");
    assert.equal(captured[1].agent, undefined, "plain-http fesmu request must not need an agent");
  } finally {
    https.request = originalHttps;
    http.request = originalHttp;
  }
});

test("§1.1 TLS is relaxed for *.fesmu.ru only and FESMU_STRICT_TLS=1 restores verification", async () => {
  const captured = [];
  const originalHttps = https.request;
  https.request = fakeRequestFactory(captured, () => ({ status: 200, body: "<html></html>" }));
  try {
    delete process.env.FESMU_STRICT_TLS;
    await fesmu.fesmuFetch("https://www.fesmu.ru/");
    assert.equal(captured[0].agent.options.rejectUnauthorized, false, "default agent must be relaxed");

    process.env.FESMU_STRICT_TLS = "1";
    await fesmu.fesmuFetch("https://www.fesmu.ru/");
    const strict = captured[1].agent;
    assert.equal(strict.options.rejectUnauthorized, undefined, "strict agent must not set rejectUnauthorized=false");
    assert.equal(strict.options.rejectUnauthorized === false, false, "strict verification must be restored");
    assert.equal(strict.options.minVersion, "TLSv1.2");

    // A non-fesmu host is refused before any socket/agent is created.
    const before = captured.length;
    for (const host of ["https://example.com/x", "https://fesmu.ru.evil.com/x", "https://evil-fesmu.ru/x", "https://192.168.1.1/x"]) {
      const denied = await fesmu.fesmuFetch(host);
      assert.equal(denied.ok, false, host);
      assert.equal(denied.status, 0, host);
    }
    assert.equal(captured.length, before, "guardUrl must reject non-fesmu hosts before the transport");
  } finally {
    https.request = originalHttps;
    delete process.env.FESMU_STRICT_TLS;
  }
});

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

test("§1.1 NODE_TLS_REJECT_UNAUTHORIZED is never set and the relaxed branch is the only one", () => {
  const source = readFileSync(new URL("../src/lib/university/fesmu.ts", import.meta.url), "utf8");
  const code = stripComments(source);
  assert.equal(/NODE_TLS_REJECT_UNAUTHORIZED\s*=[^=]/.test(code), false, "the process-wide TLS kill switch must not be assigned");
  assert.equal(/process\.env\.NODE_TLS_REJECT_UNAUTHORIZED/.test(code), false, "the process-wide TLS kill switch must not be read");
  const relaxed = code.match(/rejectUnauthorized\s*:\s*false/g) ?? [];
  assert.equal(relaxed.length, 1, "exactly one relaxed-agent construction is allowed");
  const envReads = [...new Set(code.match(/process\.env\.[A-Z_]+/g) ?? [])];
  assert.deepEqual(envReads, ["process.env.FESMU_STRICT_TLS"], "only the documented strict-TLS switch may be read");
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, undefined, "test environment must stay strict");
});

test("§1.1 an external redirect is refused instead of followed off-domain", async () => {
  const captured = [];
  const originalHttps = https.request;
  https.request = fakeRequestFactory(captured, (options, n) => {
    if (n === 1) return { status: 302, headers: { location: "https://evil.example/x" } };
    return { status: 200, body: "<html></html>" };
  });
  try {
    const result = await fesmu.fesmuFetch("https://www.fesmu.ru/");
    assert.equal(result.ok, false);
    assert.match(result.error, /внешн/i);
    assert.equal(captured.length, 1, "the off-domain hop must not be requested");
  } finally {
    https.request = originalHttps;
  }
});

test("§1.1 retries: 3 attempts on status 0 (2 retries), 1 attempt on 404", async () => {
  const calls = [];
  install({}, calls);
  const started = Date.now();
  const failed = await fesmu.fesmuFetch("https://www.fesmu.ru/retry-me/", { totalBudgetMs: 8000 });
  const elapsed = Date.now() - started;
  assert.equal(failed.ok, false);
  assert.equal(calls.length, 3, "contract: 2 retries after the first attempt");
  assert.ok(elapsed >= 250, `a backoff must be applied between retries (observed ${elapsed} ms)`);

  const noRetry = [];
  install({ "https://www.fesmu.ru/gone/": () => ({ ok: false, status: 404, body: "", error: "HTTP 404" }) }, noRetry);
  const result = await fesmu.fesmuFetch("https://www.fesmu.ru/gone/");
  assert.equal(result.status, 404);
  assert.equal(noRetry.length, 1, "a 4xx is not retried");
});

test("§1.1 the requested total budget is respected", async () => {
  const calls = [];
  install({}, calls);
  const started = Date.now();
  await fesmu.fesmuFetch("https://www.fesmu.ru/slow/", { timeoutMs: 500, totalBudgetMs: 400, maxAttempts: 5 });
  assert.ok(Date.now() - started < 3000, "the total budget must stop the retry loop");
});

/* ------------------------------------------------------------------ *
 * §1.3 Feeds: malformed markup, duplicates, entities, dates, limits
 * ------------------------------------------------------------------ */

test("§1.3 malformed / truncated / empty HTML never throws", () => {
  const fragments = [
    "",
    "<html>",
    "<div",
    "</section>",
    '<div class="iblock-list-item-wrap" area-label="X"><a href="/press-center/news/a/b/',
    '<div class=iblock-list-item-wrap area-label=broken>',
    '<div class="iblock-list-item-wrap" area-label="&laquo;&amp;&raquo;"><a>текст</a></div>',
    "\u0000\uFFFD<<<>>>",
  ];
  for (const html of fragments) {
    const items = fesmu.parseFeedItems(html, "news", portals.FEED_SOURCES.news);
    assert.ok(Array.isArray(items), `parseFeedItems must return an array for ${JSON.stringify(html.slice(0, 24))}`);
  }
  for (const html of fragments) {
    assert.ok(Array.isArray(fesmu.parseScheduleDocuments(html, FACULTY.url)));
  }
  // Truncated page with an unclosed anchor yields no document rather than a crash.
  assert.deepEqual(fesmu.parseScheduleDocuments('<a href="/ucheba/raspisanie/x.pdf"', FACULTY.url), []);
});

test("§1.3 duplicate PDF links with different anchor text collapse to one URL", () => {
  const items = docsFrom([
    ["/ucheba/raspisanie/same.pdf", "Экзамены 3 курс"],
    ["/ucheba/raspisanie/same.pdf", "Скачать"],
    ["/ucheba/raspisanie/same.pdf", "Экзамены"],
  ]);
  assert.equal(items.length, 1, "dedupe is by resolved absolute URL");
  assert.equal(items[0].url, `${BASE}same.pdf`);
  assert.equal(items[0].kind, "exams");
  // The implementation merges every anchor text it saw for the URL (contract
  // is silent about the merged wording, so only the count is asserted here).
  assert.ok(items[0].title.length > 0);
});

test("§1.3 protocol-relative and bare-relative hrefs resolve against the page URL", () => {
  // The base is the faculty page URL, so bare-relative hrefs resolve against the
  // page directory (contract §0.1 bug 4: `new URL(href, baseUrl)` semantics).
  const items = docsFrom([
    ["//www.fesmu.ru/ucheba/raspisanie/proto.pdf", "Протокол"],
    ["bare.pdf", "Относительный"],
    ["/ucheba/raspisanie/root.pdf", "Корневой"],
    ["./dot/./x.PDF", "Верхний регистр"],
  ]);
  const dir = FACULTY.url;
  assert.deepEqual(
    items.map((item) => item.url).sort(),
    [
      "https://www.fesmu.ru/ucheba/raspisanie/proto.pdf",
      "https://www.fesmu.ru/ucheba/raspisanie/root.pdf",
      `${dir}bare.pdf`,
      `${dir}dot/x.PDF`,
    ].sort(),
  );
  assert.equal(byUrl(items, "/x.PDF").format, "pdf", "extension detection must be case-insensitive");
});

test("§1.4 private hosts, .tmp, mailto and javascript links are dropped", () => {
  const items = docsFrom([
    ["http://192.168.2.37/upload/internal.pdf", "Внутренний 192.168"],
    ["http://10.1.2.3/x.pdf", "Внутренний 10"],
    ["http://127.0.0.1/x.pdf", "Localhost"],
    ["http://172.16.0.5/x.pdf", "Внутренний 172.16"],
    ["/ucheba/raspisanie/temp.pdf.tmp", "Временный"],
    ["mailto:study@fesmu.ru", "Почта"],
    ["javascript:alert(1)", "Скрипт"],
    ["/ucheba/raspisanie/keep.pdf", "Нужный"],
  ]);
  assert.deepEqual(items.map((item) => item.url), [`${BASE}keep.pdf`]);
});

test("§1.4 boilerplate anchors are dropped", () => {
  const items = docsFrom([
    ["/ucheba/raspisanie/kredit.pdf", "Образовательный кредит"],
    ["/ucheba/raspisanie/pravila.pdf", "Правила внутреннего распорядка"],
    ["/ucheba/raspisanie/inform.pdf", "Информирование вузов"],
    ["/ucheba/raspisanie/Образовательный_кредит.pdf", ""],
    ["/ucheba/raspisanie/normal.pdf", "Лекции 1 курс"],
  ]);
  assert.deepEqual(items.map((item) => item.url), [`${BASE}normal.pdf`]);
});

test("§1.3 a card without a date yields date=null and date_iso=null", () => {
  const html = [
    '<div class="iblock-list-item-wrap" area-label="Без даты">',
    '<a href="/press-center/news/for-students/no-date/">Без даты</a>',
    "</div></section>",
  ].join("\n");
  const items = fesmu.parseFeedItems(html, "news", portals.FEED_SOURCES.news);
  assert.equal(items.length, 1);
  assert.equal(items[0].date, null);
  assert.equal(items[0].date_iso, null);
});

test("§1.3 every accepted date must be a real calendar date", () => {
  const cases = [
    ["22.10.2026", "22.10.2026", "2026-10-22"],
    ["1.2.2026", "01.02.2026", "2026-02-01"],
    ["29.02.2024", "29.02.2024", "2024-02-29"], // leap year: valid
  ];
  for (const [raw, display, iso] of cases) {
    assert.deepEqual(fesmu.extractDateText(raw), { display, iso }, raw);
  }
  for (const broken of ["45.13.2026", "00.10.2026", "32.01.2026", "нет даты", "10/22/2026"]) {
    assert.equal(fesmu.extractDateText(broken), null, `${broken} must be rejected`);
  }
  // Impossible calendar days must not produce a bogus ISO date.
  for (const impossible of ["31.02.2026", "30.02.2026", "31.04.2026", "29.02.2025", "31.06.2026", "31.09.2026", "31.11.2026"]) {
    const parsed = fesmu.extractDateText(impossible);
    if (parsed === null) continue;
    const roundTrip = new Date(`${parsed.iso}T00:00:00.000Z`).toISOString().slice(0, 10);
    assert.equal(roundTrip, parsed.iso, `${impossible} produced the non-existent date_iso ${parsed.iso}`);
  }
});

test("§1.3 HTML entities are decoded and unknown entities survive verbatim", () => {
  const html = [
    '<div class="iblock-list-item-wrap" area-label="&laquo;Тест&raquo; &amp; &quot;кавычки&quot; &#039;x&#039; &mdash; &ndash; &hellip;&nbsp;">',
    '<p class="t--1"><i class="far fa-calendar-alt"></i> 05.03.2026</p>',
    '<a href="/press-center/news/for-students/entity-test/">Тест</a>',
    "</div></section>",
  ].join("\n");
  const items = fesmu.parseFeedItems(html, "news", portals.FEED_SOURCES.news);
  assert.equal(items.length, 1);
  // `&hellip;` is decoded to the single U+2026 ellipsis (a valid, documented choice).
  assert.equal(items[0].title, "«Тест» & \"кавычки\" 'x' — – \u2026");
  assert.equal(items[0].date_iso, "2026-03-05");
  assert.equal(fesmu.decodeEntities("&copy; &unknown; &#x41;"), "&copy; &unknown; A");
});

test("§1.3 the feed is capped at 30 items and keeps source order", () => {
  const cards = [];
  for (let index = 0; index < 40; index += 1) {
    cards.push(
      `<div class="iblock-list-item-wrap" area-label="Карточка ${index}">`,
      `<p><i class="far fa-calendar-alt"></i> 0${(index % 9) + 1}.10.2026</p>`,
      `<a href="/press-center/news/for-students/card-${index}/">Карточка ${index}</a>`,
      "</div>",
    );
  }
  const items = fesmu.parseFeedItems(cards.join("\n") + "</section>", "news", portals.FEED_SOURCES.news);
  assert.equal(items.length, 30);
  assert.equal(items[0].title, "Карточка 0");
  assert.equal(items[29].title, "Карточка 29");
});

test("§1.3 category landing pages and anchors are skipped, the article link is used", () => {
  const html = [
    '<div class="iblock-list-item-wrap" area-label="Карточка">',
    '<a href="/press-center/news/for-applicants/">Для абитуриентов</a>',
    '<a href="#top">Наверх</a>',
    '<a href="/press-center/news/for-applicants/real-slug/">Настоящая новость</a>',
    "</div></section>",
  ].join("\n");
  const items = fesmu.parseFeedItems(html, "news", portals.FEED_SOURCES.news);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://www.fesmu.ru/press-center/news/for-applicants/real-slug/");
  assert.equal(items[0].section, "Для абитуриентов");
});

test("§1.3 a card whose only href belongs to another section must not leak that URL", () => {
  const html = [
    '<div class="iblock-list-item-wrap" area-label="Чужой раздел">',
    '<a href="/press-center/events/meropriyatiya/foreign-event/">Чужое событие</a>',
    "</div></section>",
  ].join("\n");
  const items = fesmu.parseFeedItems(html, "news", portals.FEED_SOURCES.news);
  // Contract §1.3: `url` = href matching ^/press-center/<section>/.../ for the
  // parsed feed, so a news page must not emit an events URL.
  for (const item of items) {
    assert.ok(
      item.url.startsWith("https://www.fesmu.ru/press-center/news/"),
      `news feed leaked a foreign section URL: ${item.url}`,
    );
    assert.equal(item.kind, "news");
  }
});

test("§1.3 an empty HTTP 200 page is reported as changed markup, not as an empty feed", async () => {
  const calls = [];
  install({ ...fixtureRoutes(), [portals.FEED_SOURCES.news]: "<html><body><p>Пусто</p></body></html>" }, calls);
  const feed = await fesmu.fetchFeed("news");
  assert.equal(feed.items.length, 0);
  assert.equal(feed.error, "Разметка источника изменилась");
});

/* ------------------------------------------------------------------ *
 * §1.4 Schedule documents
 * ------------------------------------------------------------------ */

test("§1.4 an empty faculty page is not cached as success and reports the markup error", async () => {
  const calls = [];
  install({ [FACULTY.url]: "<html><body></body></html>" }, calls);
  const schedule = await fesmu.getFacultySchedule(FACULTY.id);
  assert.ok(schedule);
  assert.equal(schedule.ok, false);
  assert.deepEqual(schedule.items, []);
  assert.equal(schedule.error, "Разметка источника изменилась");
  assert.equal(schedule.fetched_at, new Date(schedule.fetched_at).toISOString());
  const again = await fesmu.getFacultySchedule(FACULTY.id);
  assert.equal(again.cached, false, "a failed load must not populate the cache");
  assert.equal(calls.length, 2);
});

test("§1.4 course / semester / stream / kind classification", () => {
  const items = docsFrom([
    ["/ucheba/raspisanie/1_lech_osen.pdf", "Лекции 1 курс"],
    ["/ucheba/raspisanie/2kurs_vesna.pdf", "Занятия 2-й курс весна"],
    ["/ucheba/raspisanie/3._ekz.pdf", "Экзамены"],
    ["/ucheba/raspisanie/4_prakt.pdf", "Зачеты по практике"],
    ["/ucheba/raspisanie/5_zachet.pdf", "Зачеты"],
    ["/ucheba/raspisanie/6_dolg.pdf", "Ликвидация академической задолженности"],
    ["/ucheba/raspisanie/7_gia.pdf", "ГИА"],
    ["/ucheba/raspisanie/8_diplom.pdf", "График вручения дипломов"],
    ["/ucheba/raspisanie/9_grafik.pdf", "График учебного процесса"],
    ["/ucheba/raspisanie/other.pdf", "Памятка поступающему"],
  ]);
  const expected = {
    "1_lech_osen.pdf": { course_number: 1, semester: "осенний", kind: "lectures" },
    "2kurs_vesna.pdf": { course_number: 2, semester: "весенний", kind: "classes" },
    "3._ekz.pdf": { course_number: 3, kind: "exams" },
    "4_prakt.pdf": { kind: "practice-exams" },
    "5_zachet.pdf": { kind: "credits" },
    "6_dolg.pdf": { kind: "debt", is_debt: true },
    "7_gia.pdf": { kind: "gia" },
    "8_diplom.pdf": { kind: "diploma" },
    "9_grafik.pdf": { kind: "process-graph" },
    "other.pdf": { kind: "other" },
  };
  for (const [file, want] of Object.entries(expected)) {
    const item = byUrl(items, `/${file}`);
    assert.ok(item, `${file} parsed`);
    for (const [key, value] of Object.entries(want)) {
      assert.equal(item[key], value, `${file}.${key}`);
    }
  }
});

test("§1.4 `1 поток` is a stream, never a course", () => {
  const titleOnly = docsFrom([["/ucheba/raspisanie/zanyatiya_potok1.pdf", "Занятия (1 поток)"]]);
  assert.equal(titleOnly[0].course_number, null, "a title that only names a stream must not invent a course");
  assert.equal(titleOnly[0].course, null);
  assert.equal(titleOnly[0].stream, "1 поток");

  const wordForm = docsFrom([["/ucheba/raspisanie/potok_2.pdf", "Лекции поток 2"]]);
  assert.equal(wordForm[0].stream, "2 поток", "contract: the `поток N` form maps to «N поток»");

  const numbered = docsFrom([["/ucheba/raspisanie/potok_no3.pdf", "Занятия поток №3"]]);
  assert.equal(numbered[0].stream, "3 поток", "«поток №3» must be recognised");
});

test("§1.4 a stream-titled PDF with a digit-leading filename must not become a course", () => {
  const items = docsFrom([["/ucheba/raspisanie/1_potok_osen.pdf", "1 поток"]]);
  assert.equal(items[0].stream, "1 поток");
  assert.equal(
    items[0].course_number,
    null,
    "«1 поток» in the title must not be turned into «1 курс» by the file-stem prefix rule",
  );
});

test("§1.4 an empty anchor falls back to the nearest preceding heading before the filename", () => {
  const html = [
    "<h3>Расписание экзаменов</h3>",
    '<p><a href="/ucheba/raspisanie/heading.pdf"></a></p>',
  ].join("\n");
  const items = fesmu.parseScheduleDocuments(html, FACULTY.url);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Расписание экзаменов", "contract: nearest preceding heading is a title source");
  assert.equal(items[0].title_source, "page");
});

test("§1.4 an empty anchor with no heading/attributes uses the filename and marks it", () => {
  const items = docsFrom([["/ucheba/raspisanie/3_lech_z_osen.pdf", ""]]);
  assert.equal(items[0].title_source, "filename");
  assert.equal(items[0].title, "lech z osen");
  assert.equal(items[0].course_number, 3);
  assert.equal(items[0].semester, "осенний");
});

test("§1.4 formats are read from the extension, other links are ignored", () => {
  const items = docsFrom([
    ["/ucheba/raspisanie/a.doc", "A"],
    ["/ucheba/raspisanie/b.docx", "B"],
    ["/ucheba/raspisanie/c.xls", "C"],
    ["/ucheba/raspisanie/d.xlsx", "D"],
    ["/ucheba/raspisanie/e.pdf", "E"],
    ["/ucheba/raspisanie/f.txt", "F"],
    ["/ucheba/raspisanie/g", "G"],
    ["/ucheba/raspisanie/h.htm", "H"],
  ]);
  assert.deepEqual(
    Object.fromEntries(items.map((item) => [item.url.split("/").pop(), item.format])),
    { "a.doc": "doc", "b.docx": "docx", "c.xls": "xls", "d.xlsx": "xlsx", "e.pdf": "pdf" },
  );
  for (const item of items) {
    assert.ok(item.context === null || typeof item.context === "string", "context must be string|null");
    assert.equal(item.title_source === "page" || item.title_source === "filename", true);
    assert.equal(typeof item.is_debt, "boolean");
  }
});

test("§1.4 sorting: course asc, nulls last, then kind order, then title", () => {
  const items = docsFrom([
    ["/ucheba/raspisanie/b.pdf", "Лекции 2 курс"],
    ["/ucheba/raspisanie/a.pdf", "Лекции 1 курс"],
    ["/ucheba/raspisanie/z.pdf", "Экзамены без курса"],
    ["/ucheba/raspisanie/c.pdf", "Экзамены 1 курс"],
  ]);
  assert.deepEqual(
    items.map((item) => item.url.split("/").pop()),
    ["a.pdf", "c.pdf", "b.pdf", "z.pdf"],
  );
  const second = docsFrom([
    ["/ucheba/raspisanie/x.pdf", "Лекции 5 курс"],
    ["/ucheba/raspisanie/y.pdf", "Зачеты 5 курс"],
  ]);
  assert.deepEqual(
    second.map((item) => item.url.split("/").pop()),
    ["x.pdf", "y.pdf"],
    "kind order: lectures before credits",
  );
});

/* ------------------------------------------------------------------ *
 * §1.2 Cache: TTL boundary, stale serving, first-load failure
 * ------------------------------------------------------------------ */

test("§1.2 cache TTL boundary: hit at 29:59, miss at exactly 30:00", async () => {
  const calls = [];
  install(fixtureRoutes(), calls);
  const base = Date.parse("2026-10-25T00:00:00.000Z");
  mock.timers.enable({ apis: ["Date"], now: base });
  try {
    const first = await fesmu.fetchFeed("news");
    assert.equal(first.cached, false);
    assert.equal(calls.length, 1);
    assert.equal(first.fetched_at, "2026-10-25T00:00:00.000Z");

    mock.timers.setTime(base + 29 * 60_000 + 59_000);
    const hit = await fesmu.fetchFeed("news");
    assert.equal(hit.cached, true, "29:59 must still be a cache hit");
    assert.equal(hit.stale, false);
    assert.equal(calls.length, 1, "a cache hit performs no upstream request");
    assert.equal(hit.fetched_at, "2026-10-25T00:00:00.000Z");

    mock.timers.setTime(base + 30 * 60_000);
    const expired = await fesmu.fetchFeed("news");
    assert.equal(expired.cached, false, "at exactly the TTL the entry must expire");
    assert.equal(calls.length, 2);

    mock.timers.setTime(base + 30 * 60_000 + 29 * 60_000);
    assert.equal((await fesmu.fetchFeed("news")).cached, true);
    assert.equal(calls.length, 2, "the refreshed entry is cached again");
  } finally {
    mock.timers.reset();
  }
});

test("§1.2 the faculty payload reports cache_age_seconds for a cache hit", async () => {
  const calls = [];
  install(fixtureRoutes(), calls);
  const base = Date.parse("2026-10-25T00:00:00.000Z");
  mock.timers.enable({ apis: ["Date"], now: base });
  try {
    const fresh = await fesmu.getFacultySchedule(FACULTY.id);
    assert.equal(fresh.cached, false);
    assert.equal(fresh.cache_age_seconds, 0);
    mock.timers.setTime(base + 29 * 60_000);
    const hit = await fesmu.getFacultySchedule(FACULTY.id);
    assert.equal(hit.cached, true);
    assert.ok(Math.abs(hit.cache_age_seconds - 1740) <= 1, `cache_age_seconds ≈ 1740, got ${hit.cache_age_seconds}`);
    assert.equal(hit.fetched_at, "2026-10-25T00:00:00.000Z");
  } finally {
    mock.timers.reset();
  }
});

test("§1.2 a failed refresh serves the last good value with cached+stale+error", async () => {
  const calls = [];
  install(fixtureRoutes(), calls);
  const fresh = await fesmu.fetchFeed("news");
  const facultyFresh = await fesmu.getFacultySchedule(FACULTY.id);
  assert.equal(fresh.items.length > 0, true);

  fesmu.setFesmuTransportForTests(async (url, init) => {
    calls.push({ url, init });
    return { ok: false, status: 503, body: "", error: "HTTP 503" };
  });
  const staleFeed = await fesmu.fetchFeed("news", { force: true });
  assert.equal(staleFeed.cached, true);
  assert.equal(staleFeed.stale, true);
  assert.equal(staleFeed.error, "HTTP 503");
  assert.deepEqual(staleFeed.items, fresh.items);

  const staleFaculty = await fesmu.getFacultySchedule(FACULTY.id, { force: true });
  assert.equal(staleFaculty.cached, true);
  assert.equal(staleFaculty.stale, true);
  assert.equal(staleFaculty.ok, true);
  assert.equal(staleFaculty.error, "HTTP 503");
  assert.deepEqual(staleFaculty.items, facultyFresh.items);
  assert.equal(typeof staleFaculty.cache_age_seconds, "number");
});

test("§1.2 a first-load failure has nothing to serve stale", async () => {
  const calls = [];
  install({}, calls);
  const feed = await fesmu.fetchFeed("announcements");
  assert.equal(feed.items.length, 0);
  assert.equal(feed.cached, false);
  assert.equal(feed.stale, false);
  assert.equal(feed.fetched_at, null);
  assert.equal(feed.error, "NO_ROUTE");
  const faculty = await fesmu.getFacultySchedule("kolledzh");
  assert.equal(faculty.ok, false);
  assert.equal(faculty.cached, false);
  assert.equal(faculty.stale, false);
  assert.equal(faculty.cache_age_seconds, null);
});

/* ------------------------------------------------------------------ *
 * §1.5 Service probes
 * ------------------------------------------------------------------ */

test("§1.5 a probe never reports reachable without a real HTTP answer", async () => {
  const calls = [];
  const routes = {};
  for (const service of portals.staticServices()) routes[service.url] = "<!doctype html><title>ok</title>";
  routes[portals.PORTAL.library_url] = () => ({ ok: false, status: 0, body: "", error: "Таймаут 6 с" });
  routes[portals.PORTAL.eios_url] = () => ({ ok: false, status: 503, body: "", error: "HTTP 503" });
  install(routes, calls);
  const report = await fesmu.getServiceReport({ force: true });
  assert.equal(report.ok, true);
  assert.equal(report.services.length, 6);
  for (const service of report.services) {
    assert.equal(typeof service.checked_at, "string");
    assert.ok(!Number.isNaN(Date.parse(service.checked_at)), service.id);
    assert.equal(typeof service.reachable, "boolean");
    if (service.reachable === true) {
      assert.equal(typeof service.http_status, "number", `${service.id}: reachable implies a real status`);
      assert.equal(typeof service.latency_ms, "number");
    }
  }
  const library = report.services.find((service) => service.id === "library");
  assert.equal(library.reachable, false);
  assert.equal(library.http_status, null);
  assert.match(library.note, /Таймаут 6 с/);
  const eios = report.services.find((service) => service.id === "eios");
  assert.equal(eios.reachable, false, "HTTP 503 is not reachable");
  assert.equal(eios.http_status, 503);
});

test("§1.5 probes are bounded to ≤4 in parallel", async () => {
  const routes = {};
  for (const service of portals.staticServices()) routes[service.url] = "<!doctype html><title>ok</title>";
  let inFlight = 0;
  let peak = 0;
  fesmu.setFesmuTransportForTests(async (url) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { ok: true, status: 200, body: routes[url], error: null };
    } finally {
      inFlight -= 1;
    }
  });
  const report = await fesmu.getServiceReport({ force: true });
  assert.equal(report.services.length, 6);
  assert.ok(peak <= 4, `concurrency must stay ≤4, observed ${peak}`);
  assert.ok(peak >= 2, `probes must overlap, observed ${peak}`);
});

test("§1.5 HEAD is tried first and GET only after a real non-2xx status", async () => {
  const calls = [];
  const routes = {};
  for (const service of portals.staticServices()) {
    routes[service.url] = (url, init) =>
      init.method === "HEAD"
        ? { ok: false, status: 405, body: "", error: "HTTP 405" }
        : { ok: true, status: 200, body: "<html></html>", error: null };
  }
  install(routes, calls);
  const report = await fesmu.getServiceReport({ force: true });
  assert.equal(report.services.every((service) => service.reachable === true), true);
  assert.equal(calls.filter((call) => call.init.method === "HEAD").length, 6);
  assert.equal(calls.filter((call) => call.init.method === "GET").length, 6);
});

/* ------------------------------------------------------------------ *
 * §2 Frozen API shapes — route handlers exercised directly
 * ------------------------------------------------------------------ */

const shapeProblems = [];
function expectField(object, key, kind, label) {
  if (object === null || typeof object !== "object" || !(key in object)) {
    shapeProblems.push(`${label}: missing field "${key}"`);
    return undefined;
  }
  const value = object[key];
  const checks = {
    string: () => typeof value === "string" && value.length > 0,
    "string|empty": () => typeof value === "string",
    boolean: () => typeof value === "boolean",
    number: () => typeof value === "number" && Number.isFinite(value),
    array: () => Array.isArray(value),
    object: () => value !== null && typeof value === "object" && !Array.isArray(value),
    iso: () => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)),
    "string|null": () => value === null || typeof value === "string",
    "number|null": () => value === null || (typeof value === "number" && Number.isFinite(value)),
    "boolean|null": () => value === null || typeof value === "boolean",
    "iso|null": () => value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value))),
  }[kind];
  if (!checks) throw new Error(`unknown shape kind ${kind}`);
  if (!checks()) {
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    shapeProblems.push(`${label}.${key}: expected ${kind}, got ${actual} ${JSON.stringify(value)?.slice(0, 60)}`);
  }
  return value;
}

function collectShapeProblems(run) {
  shapeProblems.length = 0;
  run();
  return [...shapeProblems];
}

function checkFeedItem(item, label) {
  expectField(item, "title", "string", label);
  expectField(item, "url", "string", label);
  expectField(item, "date", "string|null", label);
  expectField(item, "date_iso", "string|null", label);
  expectField(item, "section", "string|null", label);
  expectField(item, "source", "string", label);
  expectField(item, "kind", "string", label);
  if (item && item.date_iso) {
    assert.match(item.date_iso, /^\d{4}-\d{2}-\d{2}$/, `${label}.date_iso must be YYYY-MM-DD`);
    assert.equal(
      new Date(`${item.date_iso}T00:00:00.000Z`).toISOString().slice(0, 10),
      item.date_iso,
      `${label}.date_iso must be a real calendar date`,
    );
  }
}

function checkFaculty(faculty, label) {
  expectField(faculty, "id", "string", label);
  expectField(faculty, "slug", "string", label);
  expectField(faculty, "title", "string", label);
  expectField(faculty, "short", "string", label);
  expectField(faculty, "program", "string|null", label);
  expectField(faculty, "code", "string|null", label);
  expectField(faculty, "url", "string", label);
}

function checkScheduleItem(item, label, { document = false } = {}) {
  expectField(item, "title", "string", label);
  expectField(item, "title_source", "string", label);
  expectField(item, "url", "string", label);
  expectField(item, "course", "string|null", label);
  expectField(item, "course_number", "number|null", label);
  expectField(item, "semester", "string|null", label);
  expectField(item, "stream", "string|null", label);
  expectField(item, "kind", "string", label);
  expectField(item, "kind_label", "string", label);
  expectField(item, "format", "string", label);
  expectField(item, "context", "string|null", label);
  expectField(item, "is_debt", "boolean", label);
  assert.ok(["page", "filename"].includes(item.title_source), `${label}.title_source`);
  assert.ok(
    ["lectures", "classes", "exams", "practice-exams", "credits", "debt", "gia", "diploma", "process-graph", "other"].includes(item.kind),
    `${label}.kind = ${item.kind}`,
  );
  assert.ok(["pdf", "doc", "docx", "xls", "xlsx"].includes(item.format), `${label}.format = ${item.format}`);
  if (document) {
    expectField(item, "type", "string", label);
    assert.equal(item.type, "document");
  }
}

function checkService(service, label) {
  expectField(service, "id", "string", label);
  expectField(service, "title", "string", label);
  expectField(service, "url", "string", label);
  expectField(service, "category", "string", label);
  expectField(service, "description", "string", label);
  expectField(service, "badge", "string", label);
  expectField(service, "reachable", "boolean|null", label);
  expectField(service, "http_status", "number|null", label);
  expectField(service, "latency_ms", "number|null", label);
  expectField(service, "checked_at", "iso|null", label);
  expectField(service, "note", "string", label);
  assert.ok(["portal", "lms", "schedule", "library", "testing", "news"].includes(service.category), `${label}.category`);
}

function checkFeed(feed, label) {
  expectField(feed, "source", "string", label);
  expectField(feed, "label", "string", label);
  expectField(feed, "items", "array", label);
  expectField(feed, "error", "string|null", label);
  expectField(feed, "cached", "boolean", label);
  expectField(feed, "stale", "boolean", label);
  expectField(feed, "fetched_at", "iso|null", label);
  (feed.items ?? []).forEach((item, index) => checkFeedItem(item, `${label}.items[${index}]`));
}

function checkPortal(portal, label) {
  for (const key of ["name", "url", "eios_url", "testing_url", "library_url", "schedule_url", "news_url", "announcements_url", "events_url"]) {
    expectField(portal, key, "string", label);
  }
}

function checkOverviewShape(body) {
  expectField(body, "ok", "boolean", "overview");
  expectField(body, "fetched_at", "iso", "overview");
  const portal = expectField(body, "portal", "object", "overview");
  if (portal) checkPortal(portal, "overview.portal");
  expectField(body, "disclaimer", "string", "overview");
  const services = expectField(body, "services", "array", "overview");
  (services ?? []).forEach((service, index) => checkService(service, `overview.services[${index}]`));
  const schedule = expectField(body, "schedule", "object", "overview");
  if (schedule) {
    expectField(schedule, "index_url", "string", "overview.schedule");
    expectField(schedule, "note", "string", "overview.schedule");
    const faculties = expectField(schedule, "faculties", "array", "overview.schedule");
    assert.equal((faculties ?? []).length, 6, "§1.4: exactly the six schedule units");
    (faculties ?? []).forEach((faculty, index) => checkFaculty(faculty, `overview.schedule.faculties[${index}]`));
    const documents = expectField(schedule, "documents", "array", "overview.schedule");
    (documents ?? []).forEach((item, index) => checkScheduleItem(item, `overview.schedule.documents[${index}]`, { document: true }));
    expectField(schedule, "cached", "boolean", "overview.schedule");
    expectField(schedule, "stale", "boolean", "overview.schedule");
    expectField(schedule, "fetched_at", "iso|null", "overview.schedule");
    expectField(schedule, "error", "string|null", "overview.schedule");
  }
  const feeds = expectField(body, "feeds", "object", "overview");
  if (feeds) {
    for (const kind of ["news", "announcements", "events"]) {
      const feed = expectField(feeds, kind, "object", "overview.feeds");
      if (feed) checkFeed(feed, `overview.feeds.${kind}`);
    }
  }
  if ("error" in body) expectField(body, "error", "string|empty", "overview");
}

function checkFacultyScheduleShape(body) {
  expectField(body, "ok", "boolean", "faculty");
  const faculty = expectField(body, "faculty", "object", "faculty");
  if (faculty) checkFaculty(faculty, "faculty.faculty");
  expectField(body, "fetched_at", "iso", "faculty");
  expectField(body, "source", "string", "faculty");
  expectField(body, "cached", "boolean", "faculty");
  expectField(body, "stale", "boolean", "faculty");
  expectField(body, "cache_age_seconds", "number|null", "faculty");
  const items = expectField(body, "items", "array", "faculty");
  (items ?? []).forEach((item, index) => checkScheduleItem(item, `faculty.items[${index}]`));
  expectField(body, "error", "string|null", "faculty");
}

function checkStatusReportShape(body) {
  expectField(body, "ok", "boolean", "status");
  expectField(body, "fetched_at", "iso", "status");
  const services = expectField(body, "services", "array", "status");
  (services ?? []).forEach((service, index) => checkService(service, `status.services[${index}]`));
}

async function importRoutes() {
  const { NextRequest } = await import("next/server");
  const overview = await import("../src/app/api/university/route.ts");
  const schedule = await import("../src/app/api/university/schedule/route.ts");
  const status = await import("../src/app/api/university/status/route.ts");
  return { NextRequest, overview, schedule, status };
}

test("§2 GET /api/university matches the frozen overview shape field-by-field", async () => {
  install(fixtureRoutes(), []);
  const { NextRequest, overview } = await importRoutes();
  const response = await overview.GET(new NextRequest("http://localhost/api/university"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  const problems = collectShapeProblems(() => checkOverviewShape(body));
  assert.deepEqual(problems, [], `§2 shape drift:\n${problems.join("\n")}`);
  assert.equal(body.ok, true);
  assert.equal(body.feeds.news.items.length, 10);
  assert.equal(body.feeds.announcements.items.length, 10);
  assert.equal(body.feeds.events.items.length, 2);
  assert.equal(body.schedule.documents.length, 6);
  assert.equal(body.services.every((service) => service.reachable === null && service.checked_at === null), true);
  assert.equal(body.schedule.cached, false);
  assert.equal(body.schedule.stale, false);
  assert.equal(body.portal.eios_url, "https://eios.fesmu.ru/WebApp/#/");
  assert.deepEqual(Object.keys(body.feeds).sort(), ["announcements", "events", "news"]);
});

test("§2 partial upstream failure keeps ok:true with a per-section error", async () => {
  const routes = fixtureRoutes();
  routes[portals.FEED_SOURCES.news] = () => ({ ok: false, status: 503, body: "", error: "HTTP 503" });
  install(routes, []);
  const { NextRequest, overview } = await importRoutes();
  const response = await overview.GET(new NextRequest("http://localhost/api/university"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.feeds.news.error, "HTTP 503");
  assert.deepEqual(body.feeds.news.items, []);
  assert.equal(body.feeds.announcements.error, null);
  assert.equal(body.feeds.announcements.items.length, 10);
  assert.equal(body.schedule.error, null);
  assert.equal(body.schedule.documents.length, 6);
});

test("§2 total upstream failure still returns a parseable ok:true payload", async () => {
  install(
    {
      [portals.FEED_SOURCES.news]: () => ({ ok: false, status: 0, body: "", error: "Сеть недоступна" }),
      [portals.FEED_SOURCES.announcements]: () => ({ ok: false, status: 0, body: "", error: "Сеть недоступна" }),
      [portals.FEED_SOURCES.events]: () => ({ ok: false, status: 0, body: "", error: "Сеть недоступна" }),
      [portals.SCHEDULE_INDEX_URL]: () => ({ ok: false, status: 0, body: "", error: "Сеть недоступна" }),
    },
    [],
  );
  const { NextRequest, overview } = await importRoutes();
  const response = await overview.GET(new NextRequest("http://localhost/api/university"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  const problems = collectShapeProblems(() => checkOverviewShape(body));
  assert.deepEqual(problems, [], `§2 shape drift:\n${problems.join("\n")}`);
  assert.equal(body.ok, true);
  for (const kind of ["news", "announcements", "events"]) {
    assert.equal(body.feeds[kind].error, "Сеть недоступна", kind);
    assert.deepEqual(body.feeds[kind].items, [], kind);
    assert.equal(body.feeds[kind].fetched_at, null, kind);
  }
  assert.equal(body.schedule.error, "Сеть недоступна");
  assert.deepEqual(body.schedule.documents, []);
  assert.equal(body.schedule.fetched_at, null);
  assert.equal(body.services.length, 6, "the static registry is still served");
  assert.equal(body.schedule.faculties.length, 6, "the static faculty list is still served");
});

test("§2 GET /api/university?faculty=<id> matches the frozen faculty shape", async () => {
  install(fixtureRoutes(), []);
  const { NextRequest, overview, schedule } = await importRoutes();
  const response = await overview.GET(new NextRequest(`http://localhost/api/university?faculty=${FACULTY.id}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  const problems = collectShapeProblems(() => checkFacultyScheduleShape(body));
  assert.deepEqual(problems, [], `§2 shape drift:\n${problems.join("\n")}`);
  assert.equal(body.ok, true);
  assert.equal(body.faculty.id, FACULTY.id);
  assert.equal(body.source, FACULTY.url);
  assert.equal(body.cached, false);
  assert.equal(body.stale, false);
  assert.equal(body.error, null);
  assert.ok(body.items.length > 40);
  assert.equal(body.items.some((item) => "type" in item), false, "faculty items must not carry type:document");

  const alias = await schedule.GET(new NextRequest(`http://localhost/api/university/schedule?faculty=${FACULTY.id}`));
  assert.equal(alias.status, 200);
  const aliasBody = await alias.json();
  assert.deepEqual(
    collectShapeProblems(() => checkFacultyScheduleShape(aliasBody)),
    [],
  );
  assert.equal(aliasBody.faculty.id, FACULTY.id);
  assert.equal(aliasBody.items.length, body.items.length, "the alias must return the same document set");
  assert.equal(aliasBody.cached, true);
});

test("§2 unknown faculty id returns the frozen 404 envelope on both routes", async () => {
  install(fixtureRoutes(), []);
  const { NextRequest, overview, schedule } = await importRoutes();
  for (const url of [
    "http://localhost/api/university?faculty=nope",
    "http://localhost/api/university?faculty=%D0%BD%D0%B5%D1%82",
  ]) {
    const response = await overview.GET(new NextRequest(url));
    assert.equal(response.status, 404, url);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, error: "Неизвестный факультет" });
  }
  const alias = await schedule.GET(new NextRequest("http://localhost/api/university/schedule?faculty=nope"));
  assert.equal(alias.status, 404);
  assert.deepEqual(await alias.json(), { ok: false, error: "Неизвестный факультет" });
});

test("§2 the canonical faculty route and its alias behave identically for edge ids", async () => {
  install(fixtureRoutes(), []);
  const { NextRequest, overview, schedule } = await importRoutes();
  const cases = [
    "http://localhost/api/university?faculty=",
    "http://localhost/api/university?faculty=0",
    "http://localhost/api/university?faculty=lechebnyy",
  ];
  for (const url of cases) {
    const canonical = await overview.GET(new NextRequest(url));
    const aliasUrl = url.replace("?faculty=", "/schedule?faculty=");
    const alias = await schedule.GET(new NextRequest(aliasUrl));
    assert.equal(
      canonical.status,
      alias.status,
      `${url}: canonical=${canonical.status} but alias=${alias.status} — the two documented routes must agree`,
    );
  }
});

test("§2 GET /api/university?status=1 and /api/university/status return the frozen probe shape", async () => {
  const routes = {};
  for (const service of portals.staticServices()) routes[service.url] = "<!doctype html><title>ok</title>";
  routes[portals.PORTAL.library_url] = () => ({ ok: false, status: 0, body: "", error: "Таймаут 6 с" });
  install(routes, []);
  const { NextRequest, overview, status } = await importRoutes();
  for (const [label, response] of [
    ["status route", await status.GET(new NextRequest("http://localhost/api/university/status"))],
    ["status=1 query", await overview.GET(new NextRequest("http://localhost/api/university?status=1"))],
  ]) {
    assert.equal(response.status, 200, label);
    assert.equal(response.headers.get("cache-control"), "no-store", label);
    const body = await response.json();
    const problems = collectShapeProblems(() => checkStatusReportShape(body));
    assert.deepEqual(problems, [], `${label} §2 shape drift:\n${problems.join("\n")}`);
    assert.equal(body.ok, true, label);
    assert.equal(body.services.length, 6, label);
    const library = body.services.find((service) => service.id === "library");
    assert.equal(library.reachable, false, label);
    assert.equal(typeof library.checked_at, "string", label);
  }
});

test("§1.5 the overview never probes and the status endpoint never blocks it", async () => {
  const calls = [];
  install(fixtureRoutes(), calls);
  const { NextRequest, overview } = await importRoutes();
  await overview.GET(new NextRequest("http://localhost/api/university"));
  // 3 ленты + индекс расписания + 6 страниц факультетов (U5: превью карточки).
  assert.equal(calls.length, 10, "overview = 3 feeds + index + 6 faculty pages, no probes");
  assert.equal(
    calls.every((call) => call.init.method === "GET"),
    true,
    "overview must never probe services (no HEAD)",
  );
});

test("§2 routes declare the Node runtime and force-dynamic rendering", async () => {
  const { overview, schedule, status } = await importRoutes();
  for (const [name, route] of [["overview", overview], ["schedule", schedule], ["status", status]]) {
    assert.equal(route.runtime, "nodejs", name);
    assert.equal(route.dynamic, "force-dynamic", name);
  }
});

/* ------------------------------------------------------------------ *
 * §4 Hard rules
 * ------------------------------------------------------------------ */

test("§4 no university I/O module touches credentials, cookies or ЕИОС auth", () => {
  const files = [
    "../src/lib/university/fesmu.ts",
    "../src/lib/university/http.ts",
    "../src/app/api/university/route.ts",
    "../src/app/api/university/status/route.ts",
    "../src/app/api/university/schedule/route.ts",
  ];
  for (const file of files) {
    const code = stripComments(readFileSync(new URL(file, import.meta.url), "utf8"));
    for (const pattern of [
      /authorization|cookie|set-cookie/i,
      /setHeader\s*\(/,
      /localStorage|sessionStorage/,
      /password\s*[:=]/i,
      /credentials\s*:\s*["']include["']/i,
    ]) {
      assert.equal(pattern.test(code), false, `${file} matched ${pattern} outside comments`);
    }
  }
  // The public UI copy must state the no-password, no-ЕИОС-login policy.
  const portalsSource = readFileSync(new URL("../src/lib/university/portals.ts", import.meta.url), "utf8");
  assert.match(portalsSource, /не хранит парол|не отправляет логины/i);
  assert.match(portalsSource, /не обходит авторизацию|Вход выполняется только на стороне вуза/i);
});

/* ------------------------------------------------------------------ *
 * §4 / §3 Front-end wiring (static inspection of the shipped source)
 * ------------------------------------------------------------------ */

test("§3 the front-end calls the documented integration endpoints only", () => {
  const api = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  assert.match(api, /integrationImports\(\)\{return api<IntegrationImportsData>\("\/integrations\/imports"\)\}/);
  assert.match(api, /integrationImport\(items[\s\S]{0,80}\/integrations\/imports",\{method:"POST"/);
  assert.match(api, /integrationImportDelete\(id[\s\S]{0,120}method:"DELETE"/);
  assert.match(api, /export type IntegrationImportSource="eios"\|"neofamily"\|"sechenov"\|"fesmu"\|"other"/);
});

test("§3 every feed item and schedule row gets a Save action gated on hasToken()", () => {
  const feed = readFileSync(new URL("../src/components/university/FeedList.tsx", import.meta.url), "utf8");
  assert.match(feed, /<SaveButton payload=\{payloadFor\(item, active\)\} \/>/);
  const schedule = readFileSync(new URL("../src/components/university/SchedulePanel.tsx", import.meta.url), "utf8");
  assert.match(schedule, /<SaveButton payload=\{schedulePayload\(item\)\} \/>/);
  const save = readFileSync(new URL("../src/components/university/SaveButton.tsx", import.meta.url), "utf8");
  assert.match(save, /if \(!ready \|\| !enabled \|\| payload\.length === 0\) return null;/);
  const provider = readFileSync(new URL("../src/components/university/ImportsProvider.tsx", import.meta.url), "utf8");
  assert.match(provider, /const authed = hasToken\(\);/);
  assert.match(provider, /setEnabled\(authed\)/);
});

test("§4 no new npm dependency was added", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const names = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of ["cheerio", "jsdom", "node-html-parser", "parse5", "axios", "got", "undici", "puppeteer", "playwright"]) {
    assert.equal(name in names, false, `${name} must not be a dependency`);
  }
  assert.equal("typescript" in (pkg.devDependencies ?? {}), true, "the loader hook relies on the existing typescript dev dependency");
});

test("§1.4 the schedule index documents come from the real fixture page", async () => {
  install(fixtureRoutes(), []);
  const page = await fesmu.getSchedulePage();
  assert.equal(page.error, null);
  assert.equal(page.documents.length, 6);
  assert.equal(page.faculties.length, 6);
  for (const item of page.documents) {
    assert.equal(item.type, "document");
    assert.equal(item.url.includes("192.168."), false);
    assert.equal(item.title_source, "page");
    assert.ok(item.title.length > 0);
  }
  const numbers = page.documents.map((item) => item.course_number);
  assert.equal(numbers.every((value) => value === null || typeof value === "number"), true);
});