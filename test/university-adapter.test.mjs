/**
 * Fixture-driven tests for the FESMU adapter (contract §1/§2).
 *
 * Network-free: every test drives the real TypeScript sources
 * (`src/lib/university/*.ts`) through the saved HTML in
 * `test/fixtures/fesmu/` and a fake transport. The TS loader hook lives in
 * `test/fixtures/fesmu/load-ts.mjs` (see its header for why it is needed).
 *
 * Run: npm.cmd run typecheck && node --test test/university-adapter.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadUniversityTs } from "./fixtures/fesmu/load-ts.mjs";

const FIXTURES = new URL("./fixtures/fesmu/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");

const fesmu = await loadUniversityTs("fesmu.ts");
const portals = await loadUniversityTs("portals.ts");

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function makeTransport(routes, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const handler = routes[url];
    if (handler === undefined) return { ok: false, status: 0, body: "", error: "Тестовый сбой" };
    if (typeof handler === "function") return handler(url, init);
    return { ok: true, status: 200, body: handler, error: null };
  };
}

function feedRoutes() {
  return {
    [portals.FEED_SOURCES.news]: fixture("feeds-news.html"),
    [portals.FEED_SOURCES.announcements]: fixture("feeds-announcements.html"),
    [portals.FEED_SOURCES.events]: fixture("feeds-events.html"),
  };
}

function allRoutes() {
  const routes = { ...feedRoutes(), [portals.SCHEDULE_INDEX_URL]: fixture("schedule-index.html") };
  for (const faculty of portals.FACULTIES) {
    routes[faculty.url] = fixture(`faculty-${faculty.id}.html`);
  }
  return routes;
}

function withTransport(routes, calls) {
  fesmu.setFesmuTransportForTests(makeTransport(routes, calls));
}

function resetTransport() {
  fesmu.setFesmuTransportForTests(null);
  fesmu.clearFesmuCache();
}

/* ------------------------------------------------------------------ *
 * Transport: host guard, no credentials, retries (contract §1.1)
 * ------------------------------------------------------------------ */

test("fesmuFetch rejects non-fesmu hosts without opening a connection", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const result = await fesmu.fesmuFetch("https://example.com/");
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.match(result.error, /fesmu\.ru/);
    assert.equal(calls.length, 0);
    const broken = await fesmu.fesmuFetch("не-урл");
    assert.equal(broken.ok, false);
    assert.equal(broken.error, "Некорректный URL");
  } finally {
    resetTransport();
  }
});

test("fesmuFetch never sends cookies, tokens or authorization", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    await fesmu.fesmuFetch(portals.FEED_SOURCES.news);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0].init).sort(), ["accept", "method", "timeoutMs"]);
    assert.equal(calls[0].init.method, "GET");
  } finally {
    resetTransport();
  }
});

test("fesmuFetch retries twice (3 attempts) and returns an error string", async () => {
  const calls = [];
  withTransport({}, calls);
  try {
    const result = await fesmu.fesmuFetch("https://www.fesmu.ru/", { timeoutMs: 500, totalBudgetMs: 4000 });
    assert.equal(result.ok, false);
    assert.equal(result.error, "Тестовый сбой");
    assert.equal(calls.length, 3);
  } finally {
    resetTransport();
  }
});

test("fesmuFetch does not retry a 404", async () => {
  const calls = [];
  withTransport({ "https://www.fesmu.ru/missing/": () => ({ ok: false, status: 404, body: "", error: "HTTP 404" }) }, calls);
  try {
    const result = await fesmu.fesmuFetch("https://www.fesmu.ru/missing/");
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(result.error, "HTTP 404");
    assert.equal(calls.length, 1);
  } finally {
    resetTransport();
  }
});

/* ------------------------------------------------------------------ *
 * Text / URL / date helpers
 * ------------------------------------------------------------------ */

test("decodeEntities handles named, decimal and hex references", () => {
  assert.equal(
    fesmu.decodeEntities("&nbsp;&laquo;Тест&raquo; &#039;x&#039; &amp; &mdash; &hellip; &#8212; &#x41;"),
    " «Тест» 'x' & — … — A",
  );
  assert.equal(fesmu.decodeEntities("no entities here"), "no entities here");
});

test("cleanText strips tags, collapses whitespace and trims separators", () => {
  assert.equal(
    fesmu.cleanText("  <b>Занятия</b>\n\t и&nbsp;лекции ·  "),
    "Занятия и лекции",
  );
  assert.equal(fesmu.cleanText("«Ликвидация» —"), "«Ликвидация»");
  assert.equal(fesmu.cleanText("· Новости"), "Новости");
  // Leading dashes survive: they mark continuation fragments of a title.
  assert.equal(fesmu.cleanText("-27 уч.года"), "-27 уч.года");
  assert.equal(fesmu.cleanText(""), "");
});

test("resolveUrl joins relative and protocol-relative hrefs with new URL()", () => {
  const base = "https://www.fesmu.ru/ucheba/raspisanie/";
  assert.equal(
    fesmu.resolveUrl("//www.fesmu.ru/ucheba/raspisanie/a.pdf", base),
    "https://www.fesmu.ru/ucheba/raspisanie/a.pdf",
  );
  assert.equal(
    fesmu.resolveUrl("1.1_lech_osen.pdf", base),
    "https://www.fesmu.ru/ucheba/raspisanie/1.1_lech_osen.pdf",
  );
  assert.equal(
    fesmu.resolveUrl("/ucheba/raspisanie/b.pdf", base),
    "https://www.fesmu.ru/ucheba/raspisanie/b.pdf",
  );
  assert.equal(fesmu.resolveUrl("http://192.168.2.37/upload/x.pdf", base), null);
  assert.equal(fesmu.resolveUrl("http://10.1.2.3/x.pdf", base), null);
  assert.equal(fesmu.resolveUrl("http://127.0.0.1/x.pdf", base), null);
  assert.equal(fesmu.resolveUrl("mailto:test@fesmu.ru", base), null);
  assert.equal(fesmu.resolveUrl("#anchor", base), null);
});

test("extractDateText produces dd.mm.yyyy + date_iso and rejects impossible dates", () => {
  assert.deepEqual(fesmu.extractDateText("... 22.10.2026 ..."), { display: "22.10.2026", iso: "2026-10-22" });
  assert.deepEqual(fesmu.extractDateText("1.2.2026"), { display: "01.02.2026", iso: "2026-02-01" });
  assert.equal(fesmu.extractDateText("45.13.2026"), null);
  assert.equal(fesmu.extractDateText("нет даты"), null);
});

/* ------------------------------------------------------------------ *
 * Press-center feeds (contract §1.3)
 * ------------------------------------------------------------------ */

test("news fixture: 10 cards, absolute URLs, dates, sections, no landing pages", async () => {
  const calls = [];
  withTransport(feedRoutes(), calls);
  try {
    const feed = await fesmu.fetchFeed("news");
    assert.equal(feed.error, null);
    assert.equal(feed.cached, false);
    assert.equal(feed.items.length, 10);
    assert.equal(feed.label, "Новости");
    for (const item of feed.items) {
      assert.match(item.url, /^https:\/\/www\.fesmu\.ru\/press-center\/news\/[^/]+\/[^/]+\/$/);
      assert.notEqual(item.title.trim(), "");
      assert.equal(item.kind, "news");
      assert.equal(item.source, portals.FEED_SOURCES.news);
      assert.equal(item.date_iso, item.date.split(".").reverse().join("-"));
    }
    assert.equal(feed.items[0].date, "23.10.2026");
    assert.equal(feed.items[0].date_iso, "2026-10-23");
    assert.equal(feed.items[0].section, "Для абитуриентов");
    assert.equal(feed.items[0].title, "Студенческий научный кружок на кафедре акушерства и гинекологии");
    assert.equal(new Set(feed.items.map((item) => item.url)).size, feed.items.length);
    assert.equal(feed.items.some((item) => /\/press-center\/news\/for-applicants\/$/.test(item.url)), false);
  } finally {
    resetTransport();
  }
});

test("announcements fixture: cards without dates keep date=null and no error", async () => {
  const calls = [];
  withTransport(feedRoutes(), calls);
  try {
    const feed = await fesmu.fetchFeed("announcements");
    assert.equal(feed.error, null);
    assert.equal(feed.items.length, 10);
    for (const item of feed.items) {
      assert.equal(item.date, null);
      assert.equal(item.date_iso, null);
      assert.match(item.url, /^https:\/\/www\.fesmu\.ru\/press-center\/announce\//);
      assert.match(item.title, /[А-Яа-яЁё]/);
    }
  } finally {
    resetTransport();
  }
});

test("events fixture: 2 cards with dates and the «Мероприятия» section", async () => {
  const calls = [];
  withTransport(feedRoutes(), calls);
  try {
    const feed = await fesmu.fetchFeed("events");
    assert.equal(feed.error, null);
    assert.equal(feed.items.length, 2);
    assert.equal(feed.items[0].date, "19.11.2026");
    assert.equal(feed.items[0].section, "Мероприятия");
    assert.equal(feed.items[1].date, "05.12.2026");
  } finally {
    resetTransport();
  }
});

test("feed parser decodes entities in the card title", () => {
  const html = [
    `<div class="iblock-list-item-wrap h-100" area-label="&laquo;Тест&#039;ы&raquo; &amp; &quot;кавычки&quot;&nbsp;">`,
    `<p class="t--1"><i class="far fa-calendar-alt"></i> 05.03.2026</p>`,
    `<a href="/press-center/news/for-students/test-slug/">Тест</a>`,
    `</div></section>`,
  ].join("\n");
  const items = fesmu.parseFeedItems(html, "news", portals.FEED_SOURCES.news);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "«Тест'ы» & \"кавычки\"");
  assert.equal(items[0].date, "05.03.2026");
  assert.equal(items[0].date_iso, "2026-03-05");
  assert.equal(items[0].section, "Для студентов");
});

test("HTTP 200 with zero parsed cards reports the markup-change error", async () => {
  const calls = [];
  withTransport({ ...feedRoutes(), [portals.FEED_SOURCES.news]: "<html><body>Пока пусто</body></html>" }, calls);
  try {
    const feed = await fesmu.fetchFeed("news");
    assert.equal(feed.items.length, 0);
    assert.equal(feed.error, "Разметка источника изменилась");
  } finally {
    resetTransport();
  }
});

test("feed failure on one source does not break the other sections", async () => {
  const calls = [];
  const routes = allRoutes();
  routes[portals.FEED_SOURCES.news] = () => ({ ok: false, status: 503, body: "", error: "HTTP 503" });
  withTransport(routes, calls);
  try {
    const overview = await fesmu.getOverview();
    assert.equal(overview.ok, true);
    assert.equal(overview.feeds.news.error, "HTTP 503");
    assert.equal(overview.feeds.news.items.length, 0);
    assert.equal(overview.feeds.announcements.items.length, 10);
    assert.equal(overview.feeds.events.items.length, 2);
    assert.equal(overview.schedule.error, null);
  } finally {
    resetTransport();
  }
});

/* ------------------------------------------------------------------ *
 * Documents (contract §1.4)
 * ------------------------------------------------------------------ */

test("schedule index yields 6 deduped global documents and drops 192.168 links", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const page = await fesmu.getSchedulePage();
    assert.equal(page.error, null);
    assert.equal(page.documents.length, 6);
    for (const item of page.documents) {
      assert.equal(item.type, "document");
      assert.equal(item.kind, "process-graph");
      assert.equal(item.format, "pdf");
      assert.equal(item.course_number, null);
      assert.equal(item.title_source, "page");
      assert.ok(item.url.startsWith("https://www.fesmu.ru/ucheba/raspisanie/"));
      assert.equal(item.url.includes("192.168."), false);
      assert.ok(["осенний", "весенний"].includes(item.semester));
    }
    const merged = page.documents.find((item) => item.url.endsWith("grafik_uch_raspisaniya_osennij_semestr-2026-2027.pdf"));
    assert.ok(merged, "deduplicated document present");
    assert.equal(page.documents.filter((item) => item.url === merged.url).length, 1);
    assert.match(merged.title, /2026-27 уч\.года/);
    assert.equal(page.faculties.length, 6);
    assert.equal(page.faculties[3].id, "farmatsii");
    assert.equal(page.faculties[5].code, null);
  } finally {
    resetTransport();
  }
});

test("faculty page: dedupe, course/semester/stream/kind, no internal links", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const schedule = await fesmu.getFacultySchedule("lechebnyy");
    assert.ok(schedule);
    assert.equal(schedule.ok, true);
    assert.equal(schedule.faculty.id, "lechebnyy");
    assert.equal(schedule.source, portals.FACULTIES[0].url);
    assert.ok(schedule.items.length > 40, `expected many documents, got ${schedule.items.length}`);
    for (const item of schedule.items) {
      assert.equal(item.url.includes("192.168."), false);
      assert.equal(/Образовательный кредит|Правила внутреннего распорядка|Информирование вузов/i.test(item.title), false);
    }

    const fresh = schedule.items.find((item) => item.url.endsWith("/1.1_lech_osen.pdf"));
    assert.ok(fresh, "1.1_lech_osen.pdf parsed");
    assert.equal(fresh.title, "Занятия и лекции");
    assert.equal(fresh.title_source, "page");
    assert.equal(fresh.course, "1 курс");
    assert.equal(fresh.course_number, 1);
    assert.equal(fresh.semester, "осенний");
    assert.equal(fresh.kind, "classes");
    assert.equal(fresh.kind_label, "Занятия и лекции");
    assert.equal(fresh.format, "pdf");
    assert.equal(fresh.is_debt, false);
    assert.match(fresh.context ?? "", /Осенний семестр/);

    const streamed = schedule.items.filter((item) => item.url.endsWith("/2.1_lech_z_osen.pdf"));
    assert.equal(streamed.length, 1, "same PDF linked twice is deduped");
    assert.equal(streamed[0].stream, "1 поток");
    assert.equal(streamed[0].title, "Занятия и лекции (1 поток)");
    assert.equal(streamed[0].course_number, 2);

    const practice = schedule.items.find((item) => item.url.endsWith("/ekz_prakt_2_lech.pdf"));
    assert.ok(practice);
    assert.equal(practice.kind, "practice-exams");
    assert.equal(practice.kind_label, "Экзамены по практике");
    // U2: курс теперь читается и из колонки таблицы, а не только из имени файла,
    // поэтому «экзамены по практике» 2 курса больше не падают в «Общие материалы».
    assert.equal(practice.course_number, 2);

    const numbers = schedule.items.map((item) => item.course_number);
    const defined = numbers.filter((value) => value !== null);
    assert.deepEqual(defined, [...defined].sort((a, b) => a - b), "course numbers ascend");
    const firstNull = numbers.indexOf(null);
    if (firstNull !== -1) {
      assert.equal(numbers.slice(firstNull).every((value) => value === null), true, "null courses sort last");
    }
  } finally {
    resetTransport();
  }
});

test("farmatsii page: <br>-split debt caption is merged and marked is_debt", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const schedule = await fesmu.getFacultySchedule("farmatsii");
    assert.ok(schedule);
    const debt = schedule.items.find((item) => item.url.endsWith("/Likvid_zadol_farm_osen.pdf"));
    assert.ok(debt, "debt document parsed");
    assert.equal(debt.title, "Ликвидация академической задолженности");
    assert.equal(debt.kind, "debt");
    assert.equal(debt.kind_label, "Ликвидация академической задолженности");
    assert.equal(debt.is_debt, true);
    assert.equal(debt.semester, "осенний");
    assert.equal(debt.course_number, null);
  } finally {
    resetTransport();
  }
});

test("pediatrics page: split «практик»+«е» anchor text is joined", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const schedule = await fesmu.getFacultySchedule("pediatricheskiy");
    assert.ok(schedule);
    const practice = schedule.items.find((item) => item.url.endsWith("/ekz_prakt_3_ped.pdf"));
    assert.ok(practice);
    assert.equal(practice.title, "Экзамены по практике");
    assert.equal(practice.kind, "practice-exams");
    const lectures = schedule.items.find((item) => item.url.endsWith("/4_ped_l_osen.pdf"));
    assert.ok(lectures);
    assert.equal(lectures.kind, "lectures");
    assert.equal(lectures.course, "4 курс");
  } finally {
    resetTransport();
  }
});

test("synthetic page: protocol-relative/relative hrefs resolve, boilerplate drops", () => {
  const pageUrl = "https://www.fesmu.ru/ucheba/raspisanie/lechebnyy-fakultet-31-05-01-lechebnoe-delo/";
  const html = [
    `<a href="http://192.168.2.37/upload/x.pdf">Образовательный кредит</a>`,
    `<a href="/ucheba/raspisanie/rukd.pdf">Правила внутреннего распорядка</a>`,
    `<a href="//www.fesmu.ru/ucheba/raspisanie/proto.pdf">Протокол</a>`,
    `<a href="files/rel.pdf">Относительный</a>`,
    `<a href="/ucheba/raspisanie/dup.pdf">Дубликат</a>`,
    `<a href="/ucheba/raspisanie/dup.pdf">Тот же файл</a>`,
    `<a href="/ucheba/raspisanie/3_lech_z_osen.pdf" title=""></a>`,
  ].join("\n");
  const items = fesmu.parseScheduleDocuments(html, pageUrl);
  const urls = items.map((item) => item.url).sort();
  assert.deepEqual(urls, [
    "https://www.fesmu.ru/ucheba/raspisanie/3_lech_z_osen.pdf",
    "https://www.fesmu.ru/ucheba/raspisanie/dup.pdf",
    "https://www.fesmu.ru/ucheba/raspisanie/lechebnyy-fakultet-31-05-01-lechebnoe-delo/files/rel.pdf",
    "https://www.fesmu.ru/ucheba/raspisanie/proto.pdf",
  ]);
  const dup = items.find((item) => item.url.endsWith("/dup.pdf"));
  assert.equal(dup.title, "Дубликат Тот же файл");
  const fromName = items.find((item) => item.url.endsWith("/3_lech_z_osen.pdf"));
  assert.equal(fromName.title_source, "filename");
  assert.equal(fromName.title, "lech z osen");
  assert.equal(fromName.course, "3 курс");
  assert.equal(fromName.semester, "осенний");
  for (const item of items) {
    assert.equal(/Образовательный кредит|Правила внутреннего распорядка/.test(item.title), false);
  }
});

test("kolledzh and mediko-gumanitarnyy fixtures parse without throwing", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    for (const id of ["kolledzh", "mediko-gumanitarnyy", "stomatologicheskiy"]) {
      const schedule = await fesmu.getFacultySchedule(id, { force: true });
      assert.ok(schedule, id);
      assert.equal(schedule.ok, true, id);
      assert.ok(schedule.items.length > 5, `${id}: ${schedule.items.length} items`);
      assert.equal(schedule.items.some((item) => item.url.includes("192.168.")), false, id);
    }
    // Unknown / empty ids resolve to null → the route answers 404.
    assert.equal(await fesmu.getFacultySchedule("nope"), null);
    assert.equal(await fesmu.getFacultySchedule(""), null);
    assert.equal(await fesmu.getFacultySchedule(null), null);
  } finally {
    resetTransport();
  }
});

test("every faculty fixture is reachable and parses", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    for (const faculty of portals.FACULTIES) {
      const schedule = await fesmu.getFacultySchedule(faculty.id, { force: true });
      assert.ok(schedule, faculty.id);
      assert.equal(schedule.ok, true, `${faculty.id}: ${schedule.error}`);
      assert.ok(schedule.items.length > 5, faculty.id);
    }
  } finally {
    resetTransport();
  }
});

/* ------------------------------------------------------------------ *
 * Cache: hit + stale fallback (contract §1.2)
 * ------------------------------------------------------------------ */

test("feed cache: the second call is served from cache without a new request", async () => {
  const calls = [];
  withTransport(feedRoutes(), calls);
  try {
    const first = await fesmu.fetchFeed("news");
    const second = await fesmu.fetchFeed("news");
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.stale, false);
    assert.equal(second.items.length, first.items.length);
    assert.equal(calls.length, 1);
    assert.match(second.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    resetTransport();
  }
});

test("feed cache: a failed refresh serves the last good value as stale", async () => {
  const calls = [];
  withTransport(feedRoutes(), calls);
  try {
    const fresh = await fesmu.fetchFeed("news");
    assert.equal(fresh.items.length, 10);
    fesmu.setFesmuTransportForTests(async (url, init) => {
      calls.push({ url, init });
      return { ok: false, status: 404, body: "", error: "HTTP 404" };
    });
    const stale = await fesmu.fetchFeed("news", { force: true });
    assert.equal(stale.cached, true);
    assert.equal(stale.stale, true);
    assert.equal(stale.error, "HTTP 404");
    assert.equal(stale.items.length, 10);
    assert.equal(stale.items[0].url, fresh.items[0].url);
  } finally {
    resetTransport();
  }
});

test("faculty cache: hit and stale fallback", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const fresh = await fesmu.getFacultySchedule("lechebnyy");
    assert.ok(fresh);
    assert.equal(fresh.cached, false);
    const total = fresh.items.length;
    const cached = await fesmu.getFacultySchedule("lechebnyy");
    assert.ok(cached);
    assert.equal(cached.cached, true);
    assert.equal(cached.stale, false);
    assert.equal(cached.items.length, total);
    assert.equal(typeof cached.cache_age_seconds, "number");

    fesmu.setFesmuTransportForTests(async (url, init) => {
      calls.push({ url, init });
      return { ok: false, status: 503, body: "", error: "HTTP 503" };
    });
    const stale = await fesmu.getFacultySchedule("lechebnyy", { force: true });
    assert.ok(stale);
    assert.equal(stale.ok, true);
    assert.equal(stale.cached, true);
    assert.equal(stale.stale, true);
    assert.equal(stale.error, "HTTP 503");
    assert.equal(stale.items.length, total);
  } finally {
    resetTransport();
  }
});

test("a first-load failure has no cache to fall back on", async () => {
  const calls = [];
  withTransport({}, calls);
  try {
    const feed = await fesmu.fetchFeed("events");
    assert.equal(feed.items.length, 0);
    assert.equal(feed.cached, false);
    assert.equal(feed.stale, false);
    assert.equal(feed.fetched_at, null);
    assert.equal(feed.error, "Тестовый сбой");
    const schedule = await fesmu.getFacultySchedule("kolledzh");
    assert.ok(schedule);
    assert.equal(schedule.ok, false);
    assert.equal(schedule.items.length, 0);
    assert.equal(schedule.cache_age_seconds, null);
    assert.equal(schedule.error, "Тестовый сбой");
  } finally {
    resetTransport();
  }
});

/* ------------------------------------------------------------------ *
 * Overview + service probes (contract §1.5, §2)
 * ------------------------------------------------------------------ */

test("overview: frozen shape, registry without probes, 6 faculties, 3 feeds", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const overview = await fesmu.getOverview();
    assert.equal(overview.ok, true);
    assert.match(overview.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(overview.services.length, 7);
    for (const service of overview.services) {
      assert.equal(service.reachable, null);
      assert.equal(service.checked_at, null);
      assert.equal(service.http_status, null);
      assert.equal(service.latency_ms, null);
      assert.ok(["portal", "lms", "schedule", "library", "testing", "news"].includes(service.category));
    }
    assert.equal(overview.portal.eios_url, "https://eios.fesmu.ru/WebApp/#/");
    assert.deepEqual(Object.keys(overview.feeds).sort(), ["announcements", "events", "news"]);
    assert.equal(overview.feeds.news.items.length, 10);
    assert.equal(overview.feeds.announcements.items.length, 10);
    assert.equal(overview.feeds.events.items.length, 2);
    assert.equal(overview.schedule.documents.length, 6);
    assert.equal(overview.schedule.faculties.length, 6);
    for (const feed of Object.values(overview.feeds)) {
      assert.deepEqual(Object.keys(feed).sort(), [
        "cached",
        "error",
        "fetched_at",
        "items",
        "label",
        "source",
        "stale",
      ]);
    }
    // The overview must not probe services (no HEAD), but it does read the six
    // faculty pages: that is what fills `faculty_summaries` (U5).
    assert.equal(calls.length, 10);
    for (const call of calls) {
      assert.notEqual(String(call.init?.method || "GET").toUpperCase(), "HEAD", "overview must not probe");
    }
    assert.equal(overview.schedule.faculty_summaries.length, 6);
    const farmSummary = overview.schedule.faculty_summaries.find((summary) => summary.id === "farmatsii");
    assert.ok(farmSummary.doc_count > 0, "specialty preview must be filled from the cached page");
    assert.ok(farmSummary.programs.length >= 2, "both specialties of the faculty must be visible");
  } finally {
    resetTransport();
  }
});

test("service probes report only real HTTP answers", async () => {
  const calls = [];
  const routes = {};
  for (const service of portals.staticServices()) routes[service.url] = "<!doctype html><title>ok</title>";
  routes[portals.PORTAL.library_url] = () => ({ ok: false, status: 0, body: "", error: "Таймаут 6 с" });
  withTransport(routes, calls);
  try {
    const report = await fesmu.getServiceReport({ force: true });
    assert.equal(report.ok, true);
    assert.equal(report.services.length, 7);
    for (const service of report.services) {
      assert.equal(typeof service.checked_at, "string");
      assert.equal(typeof service.reachable, "boolean");
      assert.ok(service.latency_ms >= 0);
    }
    const library = report.services.find((service) => service.id === "library");
    assert.equal(library.reachable, false);
    assert.equal(library.http_status, null);
    assert.match(library.note, /Таймаут 6 с/);
    const portal = report.services.find((service) => service.id === "portal");
    assert.equal(portal.reachable, true);
    assert.equal(portal.http_status, 200);
    const testing = report.services.find((service) => service.id === "testing");
    assert.equal(testing.reachable, true);

    // Probes are cached for 10 minutes: a second call performs no new requests.
    const after = calls.length;
    const cached = await fesmu.getServiceReport();
    assert.equal(calls.length, after);
    assert.equal(cached.services.length, 7);
  } finally {
    resetTransport();
  }
});

test("service probe never marks an unanswered HEAD/GET as reachable", async () => {
  const calls = [];
  const routes = {};
  for (const service of portals.staticServices()) routes[service.url] = () => ({ ok: false, status: 0, body: "", error: "Соединение отклонено" });
  withTransport(routes, calls);
  try {
    const report = await fesmu.getServiceReport({ force: true });
    assert.equal(report.services.every((service) => service.reachable === false), true);
    assert.equal(report.services.every((service) => service.http_status === null), true);
    // A host that never answers is not retried with GET: one HEAD per service.
    assert.equal(calls.length, 7);
    assert.equal(calls.every((call) => call.init.method === "HEAD"), true);
  } finally {
    resetTransport();
  }
});

test("service probe falls back to GET when HEAD returns a real status", async () => {
  const calls = [];
  const routes = {};
  for (const service of portals.staticServices()) {
    routes[service.url] = (url, init) =>
      init.method === "HEAD"
        ? { ok: false, status: 405, body: "", error: "HTTP 405" }
        : { ok: true, status: 200, body: "<!doctype html><title>ok</title>", error: null };
  }
  withTransport(routes, calls);
  try {
    const report = await fesmu.getServiceReport({ force: true });
    assert.equal(report.services.every((service) => service.reachable === true), true);
    assert.equal(report.services.every((service) => service.http_status === 200), true);
    assert.equal(calls.filter((call) => call.init.method === "HEAD").length, 7);
    assert.equal(calls.filter((call) => call.init.method === "GET").length, 7);
  } finally {
    resetTransport();
  }
});

test("service probes run with bounded concurrency and do not serialize", async () => {
  const routes = {};
  for (const service of portals.staticServices()) routes[service.url] = "<!doctype html><title>ok</title>";
  let inFlight = 0;
  let maxInFlight = 0;
  fesmu.setFesmuTransportForTests(async (url) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      // Every request takes a tick, so overlapping probes are observable.
      await new Promise((resolve) => setTimeout(resolve, url === portals.PORTAL.library_url ? 200 : 10));
      const handler = routes[url];
      return { ok: true, status: 200, body: handler, error: null };
    } finally {
      inFlight -= 1;
    }
  });
  try {
    const report = await fesmu.getServiceReport({ force: true });
    assert.equal(report.services.length, 7);
    assert.equal(report.services.every((service) => service.checked_at !== null), true);
    assert.ok(maxInFlight <= 4, `concurrency must stay ≤4, saw ${maxInFlight}`);
    assert.ok(maxInFlight >= 3, `fast services must run together, saw ${maxInFlight}`);
  } finally {
    resetTransport();
  }
});

test("static registry copy cannot be mutated by a probe", () => {
  const first = portals.staticServices();
  first[0].reachable = true;
  const second = portals.staticServices();
  assert.equal(second[0].reachable, null);
  assert.equal(portals.findFaculty("lechebnyy")?.id, "lechebnyy");
  assert.equal(portals.findFaculty("unknown"), null);
});

test("route handlers serve the frozen envelopes with cache-control: no-store", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const { NextRequest } = await import("next/server");
    const route = await import("../src/app/api/university/route.ts");
    const scheduleRoute = await import("../src/app/api/university/schedule/route.ts");
    const statusRoute = await import("../src/app/api/university/status/route.ts");
    const base = "http://localhost/api/university";

    const missing = await route.GET(new NextRequest(`${base}?faculty=unknown`));
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    assert.deepEqual(await missing.json(), { ok: false, error: "Неизвестный факультет" });

    const overview = await route.GET(new NextRequest(base));
    assert.equal(overview.status, 200);
    assert.equal(overview.headers.get("cache-control"), "no-store");
    const overviewBody = await overview.json();
    assert.equal(overviewBody.ok, true);
    assert.equal(overviewBody.services.length, 7);
    assert.equal(overviewBody.services.every((service) => service.reachable === null), true);
    assert.equal(overviewBody.feeds.news.items.length, 10);
    assert.equal(overviewBody.feeds.announcements.items.length, 10);
    assert.equal(overviewBody.feeds.events.items.length, 2);
    assert.equal(overviewBody.schedule.documents.length, 6);
    assert.equal(overviewBody.schedule.faculties.length, 6);

    const faculty = await scheduleRoute.GET(new NextRequest(`${base}/schedule?faculty=lechebnyy`));
    assert.equal(faculty.status, 200);
    const facultyBody = await faculty.json();
    assert.equal(facultyBody.ok, true);
    assert.equal(facultyBody.faculty.id, "lechebnyy");
    assert.ok(facultyBody.items.length > 40);
    // The overview already warmed the faculty cache while building summaries (U5),
    // so the first click is served from it and honestly says so.
    assert.equal(facultyBody.cached, true);
    assert.equal(typeof facultyBody.cache_age_seconds, "number");

    const alias = await route.GET(new NextRequest(`${base}?faculty=lechebnyy`));
    const aliasBody = await alias.json();
    assert.equal(aliasBody.cached, true);
    assert.equal(aliasBody.items.length, facultyBody.items.length);

    const status = await statusRoute.GET(new NextRequest(`${base}/status`));
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.services.length, 7);
    assert.equal(typeof statusBody.fetched_at, "string");

    const viaQuery = await route.GET(new NextRequest(`${base}?status=1`));
    const viaQueryBody = await viaQuery.json();
    assert.equal(viaQueryBody.ok, true);
    assert.equal(viaQueryBody.services.length, 7);
  } finally {
    resetTransport();
  }
});

/* ------------------------------------------------------------------ *
 * Regressions for the independent verification findings (V-1 … V-5)
 * See docs/UNIVERSITY-VERIFICATION-2026-10-25.md §3.
 * ------------------------------------------------------------------ */

test("V-1 extractDateText rejects impossible calendar dates, leap years included", () => {
  for (const impossible of [
    "31.02.2026",
    "30.02.2026",
    "31.04.2026",
    "31.06.2026",
    "31.09.2026",
    "31.11.2026",
    "29.02.2025",
    "29.02.2100",
    "00.10.2026",
    "32.01.2026",
  ]) {
    assert.equal(fesmu.extractDateText(impossible), null, `${impossible} must be rejected`);
  }
  for (const [raw, iso] of [
    ["29.02.2024", "2024-02-29"],
    ["29.02.2000", "2000-02-29"],
    ["28.02.2025", "2025-02-28"],
    ["31.12.2026", "2026-12-31"],
  ]) {
    assert.equal(fesmu.extractDateText(raw)?.iso, iso, raw);
  }
  // A card with an impossible date must not leak it into date_iso/published_at.
  const html = [
    '<div class="iblock-list-item-wrap" area-label="Странная дата">',
    '<p class="t--1"><i class="far fa-calendar-alt"></i> 31.02.2026</p>',
    '<a href="/press-center/news/for-students/impossible-date/">Тест</a>',
    "</div></section>",
  ].join("\n");
  const items = fesmu.parseFeedItems(html, "news", portals.FEED_SOURCES.news);
  assert.equal(items.length, 1);
  assert.equal(items[0].date, null);
  assert.equal(items[0].date_iso, null);
});

test("V-2 a card href from another press section is never adopted", () => {
  const foreign = [
    '<div class="iblock-list-item-wrap" area-label="Чужой раздел">',
    '<a href="/press-center/events/meropriyatiya/foreign-event/">Чужое событие</a>',
    "</div></section>",
  ].join("\n");
  assert.deepEqual(fesmu.parseFeedItems(foreign, "news", portals.FEED_SOURCES.news), []);
  assert.deepEqual(fesmu.parseFeedItems(foreign, "announcements", portals.FEED_SOURCES.announcements), []);

  const mixed = [
    '<div class="iblock-list-item-wrap" area-label="Своя новость">',
    '<a href="/press-center/events/meropriyatiya/foreign-event/">Чужое событие</a>',
    '<a href="/press-center/news/for-students/own-news/">Своя новость</a>',
    "</div></section>",
  ].join("\n");
  const items = fesmu.parseFeedItems(mixed, "news", portals.FEED_SOURCES.news);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://www.fesmu.ru/press-center/news/for-students/own-news/");
  assert.equal(items[0].section, "Для студентов");
  assert.equal(items[0].kind, "news");

  // The very same card is legitimate on its own feed.
  const events = fesmu.parseFeedItems(foreign, "events", portals.FEED_SOURCES.events);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "events");
  assert.equal(events[0].section, "Мероприятия");
});

test("V-3 a digit-leading stream file name never becomes a course", () => {
  const pageUrl = portals.FACULTIES[0].url;
  const titled = fesmu.parseScheduleDocuments('<a href="/ucheba/raspisanie/1_potok_osen.pdf">1 поток</a>', pageUrl);
  assert.equal(titled.length, 1);
  assert.equal(titled[0].stream, "1 поток");
  assert.equal(titled[0].course, null);
  assert.equal(titled[0].course_number, null);
  assert.equal(titled[0].semester, "осенний");

  const generic = fesmu.parseScheduleDocuments(
    '<a href="/ucheba/raspisanie/2_potok_vesna.pdf">Занятия и лекции</a>',
    pageUrl,
  );
  assert.equal(generic[0].stream, "2 поток");
  assert.equal(generic[0].course_number, null, "the stream token in the stem is not a course");

  const numbered = fesmu.parseScheduleDocuments(
    '<a href="/ucheba/raspisanie/potok_no3.pdf">Занятия поток No3</a>',
    pageUrl,
  );
  assert.equal(numbered[0].stream, "3 поток");

  // A genuine course prefix and the «N курс» wording still work.
  const real = fesmu.parseScheduleDocuments('<a href="/ucheba/raspisanie/3_lech_osen.pdf">Занятия и лекции</a>', pageUrl);
  assert.equal(real[0].course_number, 3);
  assert.equal(real[0].stream, null);
  const worded = fesmu.parseScheduleDocuments('<a href="/ucheba/raspisanie/other.pdf">Лекции 4 курс</a>', pageUrl);
  assert.equal(worded[0].course_number, 4);
});

test("V-4 an empty anchor falls back to the nearest preceding caption, then the file name", () => {
  const pageUrl = portals.FACULTIES[0].url;
  const heading = fesmu.parseScheduleDocuments(
    ["<h3>Расписание экзаменов</h3>", '<p><a href="/ucheba/raspisanie/heading.pdf"></a></p>'].join("\n"),
    pageUrl,
  );
  assert.equal(heading.length, 1);
  assert.equal(heading[0].title, "Расписание экзаменов");
  assert.equal(heading[0].title_source, "page");

  const caption = fesmu.parseScheduleDocuments(
    ["<table><tr><td>Осенний семестр</td></tr></table>", '<a href="/ucheba/raspisanie/caption.pdf"></a>'].join("\n"),
    pageUrl,
  );
  assert.equal(caption[0].title, "Осенний семестр");
  assert.equal(caption[0].title_source, "page");

  const alone = fesmu.parseScheduleDocuments(
    '<a href="/ucheba/raspisanie/3_lech_z_osen.pdf" title=""></a>',
    pageUrl,
  );
  assert.equal(alone[0].title_source, "filename");
  assert.equal(alone[0].title, "lech z osen");
  assert.equal(alone[0].course_number, 3);
  for (const item of [...heading, ...caption, ...alone]) {
    assert.equal(["heading", "filename"].includes(item.title), false, "a placeholder must never leak into title");
  }
});

test("V-5 the canonical faculty route and its /schedule alias agree for edge ids", async () => {
  const calls = [];
  withTransport(allRoutes(), calls);
  try {
    const { NextRequest } = await import("next/server");
    const route = await import("../src/app/api/university/route.ts");
    const scheduleRoute = await import("../src/app/api/university/schedule/route.ts");
    for (const suffix of ["", "0", "nope", "%D0%BD%D0%B5%D1%82", "lechebnyy"]) {
      const canonical = await route.GET(new NextRequest(`http://localhost/api/university?faculty=${suffix}`));
      const alias = await scheduleRoute.GET(new NextRequest(`http://localhost/api/university/schedule?faculty=${suffix}`));
      assert.equal(canonical.status, alias.status, `faculty=${suffix}: routes disagree`);
      const canonicalBody = await canonical.json();
      const aliasBody = await alias.json();
      assert.equal(canonicalBody.ok, aliasBody.ok, `faculty=${suffix}: ok flag disagrees`);
    }
    const empty = await route.GET(new NextRequest("http://localhost/api/university?faculty="));
    assert.equal(empty.status, 404);
    assert.deepEqual(await empty.json(), { ok: false, error: "Неизвестный факультет" });
    const emptyAlias = await scheduleRoute.GET(new NextRequest("http://localhost/api/university/schedule?faculty="));
    assert.equal(emptyAlias.status, 404);
    assert.deepEqual(await emptyAlias.json(), { ok: false, error: "Неизвестный факультет" });
  } finally {
    resetTransport();
  }
});
