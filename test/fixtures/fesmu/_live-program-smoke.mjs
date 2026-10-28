/**
 * Живая (сетевая) проверка U1–U5 на настоящем сайте ДВГМУ.
 *
 * Не входит в `npm test` (нет сети в CI и файл начинается с `_`): запускать
 * вручную, когда нужно убедиться, что разбор специальности/курса/формы
 * соответствует текущей разметке вуза.
 *
 * Run: node test/fixtures/fesmu/_live-program-smoke.mjs
 */
import { loadUniversityTs } from "./load-ts.mjs";

const fesmu = await loadUniversityTs("fesmu.ts");
const portals = await loadUniversityTs("portals.ts");

const names = { farmatsii: "Фармация и биомедицина", "mediko-gumanitarnyy": "МГФ", lechebnyy: "Лечебный" };

for (const id of Object.keys(names)) {
  const schedule = await fesmu.getFacultySchedule(id, { force: true });
  if (!schedule || !schedule.ok) {
    console.log(`${names[id]}: НЕ ПРОЧИТАНО (${schedule?.error || "нет данных"})`);
    continue;
  }
  const programs = [...new Set(schedule.items.map((item) => item.program).filter(Boolean))];
  const courses = [...new Set(schedule.items.map((item) => item.course).filter(Boolean))];
  const forms = [...new Set(schedule.items.map((item) => item.form).filter(Boolean))];
  const streams = [...new Set(schedule.items.map((item) => item.stream).filter(Boolean))];
  console.log(`${names[id]}: файлов ${schedule.items.length}`);
  console.log(`  специальности: ${programs.length ? programs.join(" | ") : "—"}`);
  console.log(`  курсы: ${courses.join(", ") || "—"}`);
  console.log(`  формы: ${forms.join(", ") || "—"}`);
  console.log(`  потоки: ${streams.join(", ") || "—"}`);
  const unassigned = schedule.items.filter((item) => !item.program).length;
  console.log(`  без специальности: ${unassigned}`);
}

const overview = await fesmu.getSchedulePage({ force: true });
console.log("\nПревью карточек (faculty_summaries):");
for (const summary of overview.faculty_summaries) {
  const faculty = portals.FACULTIES.find((entry) => entry.id === summary.id);
  console.log(
    `  ${faculty?.short || summary.id}: ok=${summary.ok} файлов=${summary.doc_count} курсы=${summary.courses.join("/") || "—"} специальностей=${summary.programs.length} потоки=${summary.has_streams} формы=${summary.has_forms}`,
  );
}
