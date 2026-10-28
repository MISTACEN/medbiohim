/**
 * U1–U5: точность расписания ДВГМУ.
 *
 * Проверяется на РЕАЛЬНЫХ сохранённых страницах из `test/fixtures/fesmu/`:
 *
 * - **U1** специальность: на одной странице фармации лежат «33.05.01 Фармация» и
 *   «30.05.01 Медицинская биохимия» — файлы МБХ больше не попадают в группу
 *   фармацевтов; у МГФ три специальности.
 * - **U2** курс из шапки таблицы (`1 курс … 6 курс`) — реальный ДВГМУ ставит
 *   заголовок колонки в `<td>`, а не в `<th>`, и курс в тексте ссылки отсутствует.
 * - **U3** форма обучения («очная»/«заочная»/«очно-заочная») различается у МГФ.
 * - **U5** карточка факультета получает `faculty_summaries` до клика.
 *
 * Сеть не используется: транспорт подменяется фикстурами.
 *
 * Run: node --test test/university-schedule-program.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadUniversityTs } from "./fixtures/fesmu/load-ts.mjs";

const FIXTURES = new URL("./fixtures/fesmu/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");

const fesmu = await loadUniversityTs("fesmu.ts");
const portals = await loadUniversityTs("portals.ts");

const FARM_URL = portals.FACULTIES.find((faculty) => faculty.id === "farmatsii").url;
const MGF_URL = portals.FACULTIES.find((faculty) => faculty.id === "mediko-gumanitarnyy").url;
const LECH_URL = portals.FACULTIES.find((faculty) => faculty.id === "lechebnyy").url;

/* ------------------------------------------------------------------ *\n * U1 — специальность\n * ------------------------------------------------------------------ */

test("U1: every specialty of a multi-program faculty is declared in portals", () => {
  const farm = portals.FACULTIES.find((faculty) => faculty.id === "farmatsii");
  const mgf = portals.FACULTIES.find((faculty) => faculty.id === "mediko-gumanitarnyy");
  assert.deepEqual(farm.programs, ["Фармация 33.05.01", "Медицинская биохимия 30.05.01"]);
  assert.equal(mgf.programs.length, 3);
  for (const faculty of portals.FACULTIES) {
    assert.ok(Array.isArray(faculty.programs), `${faculty.id} has no programs`);
    assert.ok(faculty.programs.length > 0, `${faculty.id} has an empty programs list`);
  }
});

test("U1: файлы фармации и медицинской биохимии разведены по специальностям", () => {
  const items = fesmu.parseScheduleDocuments(fixture("faculty-farmatsii.html"), FARM_URL, { document: false });
  assert.ok(items.length > 20, `expected documents, got ${items.length}`);

  const programs = [...new Set(items.map((item) => item.program).filter(Boolean))];
  assert.equal(programs.length, 2, `expected 2 specialties, got ${JSON.stringify(programs)}`);
  assert.ok(programs.some((program) => /33\.05\.01/.test(program)), "Фармация missing");
  assert.ok(programs.some((program) => /30\.05\.01/.test(program)), "Медицинская биохимия missing");

  // Файл МБХ обязан принадлежать МБХ, а не фармации.
  const mbh = items.filter((item) => /mbh|bmh/i.test(item.url));
  assert.ok(mbh.length > 10, `expected MBH documents, got ${mbh.length}`);
  for (const item of mbh) {
    assert.match(item.program || "", /30\.05\.01/, `MBH file assigned to ${item.program}: ${item.url}`);
  }

  const farmOnly = items.filter((item) => /farm/i.test(item.url));
  assert.ok(farmOnly.length > 10);
  for (const item of farmOnly) {
    assert.match(item.program || "", /33\.05\.01/, `Фармация file assigned to ${item.program}: ${item.url}`);
  }
});

test("U1: МГФ различает три специальности, Лечебный — нет заголовков специальностей", () => {
  const mgf = fesmu.parseScheduleDocuments(fixture("faculty-mediko-gumanitarnyy.html"), MGF_URL);
  const mgfPrograms = [...new Set(mgf.map((item) => item.program).filter(Boolean))];
  assert.equal(mgfPrograms.length, 3, JSON.stringify(mgfPrograms));
  for (const code of ["39.03.02", "37.05.01", "34.03.01"]) {
    assert.ok(
      mgfPrograms.some((program) => program.includes(code)),
      `МГФ misses ${code}`,
    );
  }

  const lech = fesmu.parseScheduleDocuments(fixture("faculty-lechebnyy.html"), LECH_URL);
  assert.ok(lech.length > 0);
  for (const item of lech) {
    assert.equal(item.program, null, `Лечебный must not invent a specialty: ${item.program}`);
  }
});

/* ------------------------------------------------------------------ *\n * U2 — курс из колонки таблицы\n * ------------------------------------------------------------------ */

test("U2: курс читается из шапки колонки, даже без цифры в имени файла", () => {
  const html = [
    "<section>",
    "<table border=\"2\"><tbody>",
    "<tr><td><b>Семестр</b></td><td><b>1 курс</b></td><td><b>2 курс</b></td><td><b>3 курс</b></td></tr>",
    "<tr><td><b>Осенний семестр</b></td>",
    "<td><a href=\"/ucheba/raspisanie/osennie_zanyatiya.pdf\">Занятия и лекции</a></td>",
    "<td><a href=\"/ucheba/raspisanie/vesennie_zanyatiya.pdf\">Занятия и лекции</a></td>",
    "<td><a href=\"/ucheba/raspisanie/ekzameny_tretiy.pdf\">Экзамены</a></td>",
    "</tr>",
    "</tbody></table>",
    "</section>",
  ].join("");
  const items = fesmu.parseScheduleDocuments(html, "https://www.fesmu.ru/ucheba/raspisanie/x/");
  const byUrl = new Map(items.map((item) => [item.url.split("/").pop(), item]));
  assert.equal(byUrl.get("osennie_zanyatiya.pdf")?.course, "1 курс");
  assert.equal(byUrl.get("osennie_zanyatiya.pdf")?.course_number, 1);
  assert.equal(byUrl.get("vesennie_zanyatiya.pdf")?.course, "2 курс");
  assert.equal(byUrl.get("ekzameny_tretiy.pdf")?.course, "3 курс");
});

test("U2: курс из имени файла важнее колонки, а колонка «задолженности» курса не даёт", () => {
  const html = [
    "<table><tbody>",
    "<tr><td><b>Семестр</b></td><td><b>4 курс</b></td><td><b>Расписание ликвидации задолженности</b></td></tr>",
    "<tr><td>Весенний семестр</td>",
    "<td><a href=\"/ucheba/raspisanie/4_kurs_zanyatiya.pdf\">Занятия и лекции</a></td>",
    "<td><a href=\"/ucheba/raspisanie/likvid_zadol.pdf\">Ликвидация академической задолженности</a></td>",
    "</tr></tbody></table>",
  ].join("");
  const items = fesmu.parseScheduleDocuments(html, "https://www.fesmu.ru/ucheba/raspisanie/y/");
  const named = items.find((item) => item.url.endsWith("4_kurs_zanyatiya.pdf"));
  const debt = items.find((item) => item.url.endsWith("likvid_zadol.pdf"));
  assert.equal(named?.course_number, 4);
  assert.equal(debt?.course_number, null);
  assert.equal(debt?.is_debt, true);
});

/* ------------------------------------------------------------------ *\n * U3 — форма обучения\n * ------------------------------------------------------------------ */

test("U3: форма обучения различает очников, заочников и очно-заочную форму", () => {
  assert.equal(fesmu.deriveForm("Занятия и лекции (очная форма)"), "очная");
  assert.equal(fesmu.deriveForm("Занятия и лекции (заочная форма)"), "заочная");
  assert.equal(fesmu.deriveForm("Занятия и лекции (очно-заочная форма)"), "очно-заочная");
  assert.equal(fesmu.deriveForm("Занятия и лекции (инд. план)"), null);
  assert.equal(fesmu.deriveForm("Занятия и лекции"), null);

  const mgf = fesmu.parseScheduleDocuments(fixture("faculty-mediko-gumanitarnyy.html"), MGF_URL);
  const forms = new Set(mgf.map((item) => item.form).filter(Boolean));
  assert.ok(forms.has("очная"), "МГФ must expose очная");
  assert.ok(forms.has("заочная"), "МГФ must expose заочная");
  assert.ok(forms.has("очно-заочная"), "МГФ must expose очно-заочная");

  const sd = mgf.find((item) => /2_SD_oz_osen/i.test(item.url));
  assert.equal(sd?.form, "очно-заочная", `Сестринское дело file: ${sd?.url}`);
});

test("U3: потоки Лечебного факультета не ломаются новой разметкой", () => {
  const lech = fesmu.parseScheduleDocuments(fixture("faculty-lechebnyy.html"), LECH_URL);
  const streams = new Set(lech.map((item) => item.stream).filter(Boolean));
  assert.ok(streams.has("1 поток"), "1 поток missing");
  assert.ok(streams.has("2 поток"), "2 поток missing");
});

/* ------------------------------------------------------------------ *\n * U5 — превью карточки факультета\n * ------------------------------------------------------------------ */

test("U5: overview получает faculty_summaries по уже закэшированным страницам", async () => {
  const routes = {
    [portals.SCHEDULE_INDEX_URL]: fixture("schedule-index.html"),
    [FARM_URL]: fixture("faculty-farmatsii.html"),
    [MGF_URL]: fixture("faculty-mediko-gumanitarnyy.html"),
    [LECH_URL]: fixture("faculty-lechebnyy.html"),
  };
  const calls = [];
  fesmu.setFesmuTransportForTests(async (url) => {
    calls.push(url);
    const body = routes[url];
    if (body === undefined) return { ok: false, status: 0, body: "", error: "Тестовый сбой" };
    return { ok: true, status: 200, body, error: null };
  });
  fesmu.clearFesmuCache();
  try {
    const page = await fesmu.getSchedulePage();
    assert.ok(Array.isArray(page.faculty_summaries), "faculty_summaries missing");
    assert.equal(page.faculty_summaries.length, portals.FACULTIES.length);

    const farm = page.faculty_summaries.find((summary) => summary.id === "farmatsii");
    assert.equal(farm.ok, true);
    assert.ok(farm.doc_count > 20, `farm doc_count=${farm.doc_count}`);
    assert.ok(farm.courses.includes("1 курс"), `farm courses=${JSON.stringify(farm.courses)}`);
    assert.equal(farm.programs.length, 2);
    // На странице фармации форм обучения нет — флаг не должен врать.
    assert.equal(farm.has_forms, false);

    const mgf = page.faculty_summaries.find((summary) => summary.id === "mediko-gumanitarnyy");
    assert.equal(mgf.ok, true);
    assert.equal(mgf.programs.length, 3);
    assert.equal(mgf.has_forms, true);

    const lech = page.faculty_summaries.find((summary) => summary.id === "lechebnyy");
    assert.equal(lech.has_streams, true);
    assert.equal(lech.ok, true);

    // Недоступный факультет не ломает overview и честно помечается как неполный.
    const broken = page.faculty_summaries.find((summary) => summary.id === "stomatologicheskiy");
    assert.equal(broken.ok, false);
    assert.equal(broken.doc_count, 0);
    assert.ok(broken.programs.length > 0, "static specialty list must survive a failure");
  } finally {
    fesmu.setFesmuTransportForTests(null);
    fesmu.clearFesmuCache();
  }
});

test("U5: overview не падает, когда страницы факультетов недоступны", async () => {
  fesmu.setFesmuTransportForTests(async (url) => {
    if (url === portals.SCHEDULE_INDEX_URL) {
      return { ok: true, status: 200, body: fixture("schedule-index.html"), error: null };
    }
    return { ok: false, status: 0, body: "", error: "нет ответа" };
  });
  fesmu.clearFesmuCache();
  try {
    const page = await fesmu.getSchedulePage();
    assert.equal(page.faculty_summaries.length, portals.FACULTIES.length);
    for (const summary of page.faculty_summaries) {
      assert.equal(summary.ok, false);
      assert.ok(summary.programs.length > 0);
    }
  } finally {
    fesmu.setFesmuTransportForTests(null);
    fesmu.clearFesmuCache();
  }
});
