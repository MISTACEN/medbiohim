/**
 * ROUND-2 ADVERSARIAL SUITE — written by the LEAD (2026-10-26).
 *
 * Why this file exists: the `verifier` teammate produced the round-1 oracle
 * (`test/university-verification.test.mjs`, 47 tests) and found five defects
 * (V-1…V-5). The adapter owner then fixed them, but the verifier crashed twice
 * before it could re-verify, so the Lead wrote this independent round-2 suite to
 * attack the *new* code paths rather than re-run the oracle's existing
 * assertions. The verifier's oracle is untouched and still authoritative.
 *
 * Network-free: pure parser calls plus route handlers with a query string that
 * must short-circuit to 404 before any socket is opened.
 *
 * Run: node --test test/university-verification-round2.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadUniversityTs } from "./fixtures/fesmu/load-ts.mjs";

const fesmu = await loadUniversityTs("fesmu.ts");

const NEWS_URL = "https://www.fesmu.ru/press-center/news/";
const EVENTS_URL = "https://www.fesmu.ru/press-center/events/";

test("Lead V-1: impossible calendar dates are rejected, real ones survive", () => {
  const rejected = [
    "31.02.2026",
    "30.02.2026",
    "29.02.2025",
    "31.04.2026",
    "31.06.2026",
    "31.09.2026",
    "31.11.2026",
    "32.01.2026",
    "00.00.0000",
    "29.02.1900", // below the accepted year floor
    "29.02.2400", // above the accepted year floor / ceiling
    "опубликовано 99.99.2099",
  ];
  for (const value of rejected) {
    assert.equal(fesmu.extractDateText(value), null, `must reject ${value}`);
  }
  const accepted = {
    "31.12.2026": "2026-12-31",
    "01.01.2000": "2000-01-01",
    "29.02.2024": "2024-02-29",
    "29.02.2000": "2000-02-29",
    "05.03.2026": "2026-03-05",
  };
  for (const [input, iso] of Object.entries(accepted)) {
    assert.deepEqual(fesmu.extractDateText(input), { display: input, iso }, `must accept ${input}`);
  }
});

test("Lead V-1: a date inside unrelated prose is still extracted, and nothing leaks when absent", () => {
  const found = fesmu.extractDateText("Заседание кружка 05.03.2026 в 14:00, аудитория 3");
  assert.equal(found?.iso, "2026-03-05");
  assert.equal(fesmu.extractDateText("дата не указана"), null);
  assert.equal(fesmu.extractDateText(""), null);
});

test("Lead V-2: a card whose only href belongs to another section is not adopted", () => {
  const html = `<section><div class="iblock-list-item-wrap h-100 d-flex w-100" area-label="Чужой раздел">
    <p class="t--1 c-text-secondary mb-2"><i class="far fa-calendar-alt mr-2"></i> 05.03.2026</p>
    <a href="/press-center/events/meropriyatiya/chuzhoy-razdel/">Чужой раздел</a>
  </div></section>`;

  const asNews = fesmu.parseFeedItems(html, "news", NEWS_URL);
  assert.deepEqual(asNews, [], "an events URL must not become a news item");

  const asEvents = fesmu.parseFeedItems(html, "events", EVENTS_URL);
  assert.equal(asEvents.length, 1, "the same card must parse on its own feed");
  assert.equal(asEvents[0].url, "https://www.fesmu.ru/press-center/events/meropriyatiya/chuzhoy-razdel/");
  assert.equal(asEvents[0].date_iso, "2026-03-05");
});

test("Lead V-3: a stream digit never becomes a course, on either path", () => {
  const page = [
    `<h3>Расписание занятий</h3>`,
    `<a href="/ucheba/raspisanie/1_potok_osen.pdf">1 поток</a>`,
    `<a href="/ucheba/raspisanie/3_lech_osen.pdf">Занятия и лекции</a>`,
    `<a href="/ucheba/raspisanie/2_potok_vesna.pdf">2 поток, весенний семестр</a>`,
  ].join("\n");

  const items = fesmu.parseScheduleDocuments(page, "https://www.fesmu.ru/ucheba/raspisanie/lechebnyy/");
  assert.equal(items.length, 3, "all three documents must parse");

  const byUrl = new Map(items.map((item) => [item.url.split("/").pop(), item]));

  const streamOnly = byUrl.get("1_potok_osen.pdf");
  assert.equal(streamOnly?.course_number, null, "«1 поток» must not become «1 курс»");
  assert.equal(streamOnly?.stream, "1 поток");

  const stemCourse = byUrl.get("3_lech_osen.pdf");
  assert.equal(stemCourse?.course_number, 3, "a genuine leading digit is still a course");
  assert.equal(stemCourse?.semester, "осенний");

  const streamWithSemester = byUrl.get("2_potok_vesna.pdf");
  assert.equal(streamWithSemester?.stream, "2 поток");
  assert.equal(streamWithSemester?.semester, "весенний");
});

test("Lead V-3 (stress): an explicit «N курс» in the title wins over a stream digit", () => {
  const page = `<h3>Расписание</h3><a href="/ucheba/raspisanie/1_potok.pdf">3 поток, 2 курс</a>`;
  const [item] = fesmu.parseScheduleDocuments(page, "https://www.fesmu.ru/ucheba/raspisanie/lechebnyy/");
  assert.equal(item?.course_number, 2, "the explicit «2 курс» must win");
  assert.equal(item?.stream, "3 поток", "the stream must be preserved separately");
});

test("Lead V-4: an empty anchor takes the nearest preceding heading, never a placeholder word", () => {
  const page = `<section><h3>Расписание экзаменов</h3>
    <table><tr><td><a href="/ucheba/raspisanie/ekz_1.pdf"></a></td></tr></table>
    <h3>Расписание зачётов</h3>
    <a href="/ucheba/raspisanie/heading.pdf"></a></section>`;

  const items = fesmu.parseScheduleDocuments(page, "https://www.fesmu.ru/ucheba/raspisanie/lechebnyy/");
  const byUrl = new Map(items.map((item) => [item.url.split("/").pop(), item]));

  assert.equal(byUrl.get("ekz_1.pdf")?.title, "Расписание экзаменов");
  assert.equal(byUrl.get("ekz_1.pdf")?.title_source, "page");

  const second = byUrl.get("heading.pdf");
  assert.ok(second, "the second document must still parse");
  assert.notEqual(second.title.toLowerCase(), "heading", "no placeholder word may become a title");
  assert.ok(second.title.trim().length > 0, "a title must never be empty");
});

test("Lead V-5: a present-but-empty faculty parameter is an unknown id on both routes", async () => {
  const { NextRequest } = await import("next/server");
  const overview = await import("../src/app/api/university/route.ts");
  const alias = await import("../src/app/api/university/schedule/route.ts");

  for (const query of ["faculty=", "faculty=%20", "faculty=LF", "faculty=nope"]) {
    const canonical = await overview.GET(new NextRequest(`http://localhost/api/university?${query}`));
    const sibling = await alias.GET(new NextRequest(`http://localhost/api/university/schedule?${query}`));
    const canonicalBody = await canonical.json();
    const siblingBody = await sibling.json();
    assert.equal(canonical.status, sibling.status, `status must agree for «${query}»`);
    assert.equal(canonical.status, 404, `«${query}» must be an unknown faculty`);
    assert.equal(canonicalBody.ok, false);
    assert.equal(siblingBody.ok, false);
    assert.equal(canonicalBody.error, "Неизвестный факультет");
  }
});

test("Lead §2: the no-store header is present on every university envelope", async () => {
  const { NextRequest } = await import("next/server");
  const overview = await import("../src/app/api/university/route.ts");
  const response = await overview.GET(new NextRequest("http://localhost/api/university?faculty=nope"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});
