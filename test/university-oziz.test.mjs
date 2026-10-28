/**
 * U6–U8: публичный каталог ОЗиЗ (Moodle) и общая модель курса.
 *
 * Всё проверяется на реальных сохранённых страницах из `test/fixtures/oziz/`
 * (главная, дерево категорий, категория ИТвЗ). Сеть не используется: транспорт
 * подменяется фикстурами.
 *
 * Run: node --test test/university-oziz.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadUniversityTs } from "./fixtures/fesmu/load-ts.mjs";

const FIXTURES = new URL("./fixtures/oziz/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");

const oziz = await loadUniversityTs("oziz.ts");
const portals = await loadUniversityTs("portals.ts");

test("U6: ОЗиЗ есть в реестре сервисов рядом с ЕИОС и библиотекой", () => {
  const services = portals.staticServices();
  const ozizService = services.find((service) => service.id === "oziz");
  assert.ok(ozizService, "oziz service is missing");
  assert.equal(ozizService.category, "lms");
  assert.equal(ozizService.url, portals.OZIZ_URL);
  assert.equal(ozizService.reachable, null);
});

test("U7: дерево категорий читается из публичной страницы Moodle", () => {
  const categories = oziz.parseCategoryTree(fixture("categories.html"));
  const ids = categories.map((category) => category.id);
  for (const expected of [1, 4, 10, 11, 12]) {
    assert.ok(ids.includes(expected), `category ${expected} missing`);
  }
  const itvz = categories.find((category) => category.id === 4);
  assert.match(itvz.path, /ИТвЗ/);
  assert.match(itvz.path, /Лечебный факультет/);
  assert.ok(itvz.depth >= 3);
});

test("U7: карточки главной страницы несут преподавателя и описание", () => {
  const courses = oziz.parseCourses(fixture("home.html"));
  assert.ok(courses.length > 10, `expected public courses, got ${courses.length}`);
  const mbh = courses.find((course) => /МБХ/.test(course.title));
  assert.ok(mbh, "МБХ course missing");
  assert.match(mbh.url, /^https:\/\/ozizdvgmu\.ru\/course\/view\.php\?id=\d+$/);
  assert.ok(mbh.teachers.length > 0, "teacher missing");
  assert.ok(mbh.summary && mbh.summary.length > 10, "summary missing");
});

test("U7: страница категории даёт курсы, которых нет в блоке главной", () => {
  const courses = oziz.parseCourses(fixture("category-4.html"));
  assert.ok(courses.length > 10, `expected category courses, got ${courses.length}`);
  const course = courses.find((item) => item.id === 36);
  assert.ok(course, "course 36 missing");
  assert.match(course.title, /Информационные технологии/);
});

test("U8: специальность, программа, курс, форма и год разбираются из названия", () => {
  const mbh = oziz.deriveOzizMeta("Информационные технологии в здравоохранении. МБХ. 2026-27гг.", null);
  assert.equal(mbh.faculty, "Фармация и биомедицины");
  assert.equal(mbh.year, "2026-27");

  const lech = oziz.deriveOzizMeta("2026-27. Информационные технологии в здравоохранении. Леч. ф-т.", null);
  assert.equal(lech.faculty, "Лечебный");

  const mgf = oziz.deriveOzizMeta(
    "МГФ.ВО.СР.Заоч / 01.2026 / 34.03.01 Сестринское дело. Бакалавриат. Заочная. форма.",
    null,
  );
  assert.equal(mgf.faculty, "Медико-гуманитарный");
  assert.equal(mgf.program, "34.03.01 Сестринское дело");
  assert.equal(mgf.form, "заочная");
  assert.equal(mgf.year, "01.2026");

  const short = oziz.deriveOzizMeta("МБХ, 2к. 02.2021. Информационные технологии", null);
  assert.equal(short.course_number, 2);
  assert.equal(short.year, "02.2021");

  const range = oziz.deriveOzizMeta("МИ 1 стм. 09.2020-06.2021 Медицинская информатика", null);
  assert.equal(range.faculty, "Стоматологический");
  assert.equal(range.year, "2020-21");

  const facultyFromPath = oziz.deriveOzizMeta("История медицины", "ДВГМУ / Лечебный факультет / История медицины");
  assert.equal(facultyFromPath.faculty, "Лечебный");

  // Moodle кладёт все ИТвЗ-курсы под «Лечебный факультет»; название важнее пути.
  const mbhPath = oziz.deriveOzizMeta(
    "Информационные технологии в здравоохранении. МБХ. 2026-27гг.",
    "ДВГМУ / Лечебный факультет / Кафедра ОЗиЗ / ИТвЗ",
  );
  assert.equal(mbhPath.faculty, "Фармация и биомедицины");

  // «песочница» содержит «очн», но формой обучения не является.
  assert.equal(oziz.deriveOzizMeta("DEBUG ИТвЗ — песочница", null).form, null);
});

test("U7: загрузчик собирает каталог, кэширует и отдаёт stale при сбое", async () => {
  let calls = 0;
  let fail = false;
  oziz.setOzizTransportForTests(async (url) => {
    calls += 1;
    if (fail) return { ok: false, status: 503, body: "", error: "HTTP 503" };
    if (url.endsWith("/course/index.php")) return { ok: true, status: 200, body: fixture("categories.html") };
    if (url.endsWith("categoryid=4")) return { ok: true, status: 200, body: fixture("category-4.html") };
    if (url === portals.OZIZ_URL) return { ok: true, status: 200, body: fixture("home.html") };
    return { ok: false, status: 404, body: "", error: "HTTP 404" };
  });
  oziz.clearOzizCache();

  try {
    const first = await oziz.getOzizCatalog();
    assert.equal(first.ok, true);
    assert.equal(first.cached, false);
    assert.ok(first.courses.length > 10, `expected courses, got ${first.courses.length}`);
    assert.ok(first.categories.length >= 5);
    assert.ok(calls >= 3, `expected category+home requests, got ${calls}`);
    // «Содержимое курса — после входа»: каталог не выдаёт себя за материалы.
    assert.match(first.note, /после входа/i);

    const callsAfterFirst = calls;
    const cached = await oziz.getOzizCatalog();
    assert.equal(cached.cached, true);
    assert.equal(calls, callsAfterFirst, "cache hit must not touch the network");
    assert.equal(cached.courses.length, first.courses.length);

    fail = true;
    const stale = await oziz.getOzizCatalog({ force: true });
    assert.equal(stale.stale, true);
    assert.equal(stale.courses.length, first.courses.length);
    assert.ok(stale.error);
  } finally {
    oziz.setOzizTransportForTests(null);
    oziz.clearOzizCache();
  }
});

test("U9: адаптер не ходит в login/token и не читает куки", () => {
  const source = readFileSync(new URL("../src/lib/university/oziz.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /login\/index\.php/);
  assert.doesNotMatch(source, /token\.php/);
  assert.doesNotMatch(source, /[?&]sesskey/);
  assert.doesNotMatch(source, /\bcookie\s*:/i);
  assert.doesNotMatch(source, /authorization/i);
});
