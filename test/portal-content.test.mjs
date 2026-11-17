/**
 * Целостность статического контента портала:
 *  - каждый банк mc-index.json существует и внутренне согласован;
 *  - лекционные JSON содержат корректные записи без мусорной разметки.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PORTALS = path.join(process.cwd(), "public", "content", "portals");

const LECTURE_SETS = [
  "lectures-chem.json",
  "lectures-chem-organic.json",
  "lectures-bio.json",
  "lectures-math.json",
  "lectures-phys.json",
  "lectures-latin.json",
  "lectures-english.json",
  "lectures-history.json",
];

test("mc-index: все банки существуют и согласованы", () => {
  const index = JSON.parse(fs.readFileSync(path.join(PORTALS, "mc-index.json"), "utf8"));
  assert.ok(index.tests.length >= 20, `банков в индексе: ${index.tests.length}`);
  for (const entry of index.tests) {
    const file = path.join(PORTALS, `mc-${entry.id}.json`);
    assert.ok(fs.existsSync(file), `нет файла банка: mc-${entry.id}.json`);
    const bank = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(bank.count, bank.questions.length, `${entry.id}: count ≠ questions.length`);
    assert.equal(bank.subjectId, entry.subjectId, `${entry.id}: subjectId расходится с индексом`);
    for (const q of bank.questions) {
      const kind = q.kind ?? "choice"; // поле опционально: без kind — выбор варианта
      if (kind === "choice") {
        assert.ok(
          Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length,
          `${entry.id} №${q.id}: correct вне диапазона вариантов`,
        );
        assert.ok(q.options.length >= 2, `${entry.id} №${q.id}: меньше двух вариантов`);
      } else if (kind === "text") {
        assert.ok(q.answer && String(q.answer).trim(), `${entry.id} №${q.id}: пустой ответ`);
        assert.ok(Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length, `${entry.id} №${q.id}: нет acceptedAnswers`);
      } else {
        assert.fail(`${entry.id} №${q.id}: неизвестный kind "${kind}"`);
      }
    }
  }
});

for (const setFile of LECTURE_SETS) {
  test(`${setFile}: записи целы и без мусора`, () => {
    const file = path.join(PORTALS, setFile);
    assert.ok(fs.existsSync(file), `нет ${setFile}`);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(data.subject, `${setFile}: нет subject`);
    assert.ok(data.items.length >= 1, `${setFile}: нет лекций`);
    for (const item of data.items) {
      assert.ok(item.id && item.title, `${setFile}/${item.id}: нет id/title`);
      assert.ok(item.html && item.html.length > 200, `${setFile}/${item.id}: подозрительно короткий html`);
      assert.ok(!item.html.includes("<script"), `${setFile}/${item.id}: script в html`);
      assert.ok(!item.html.includes("w:val"), `${setFile}/${item.id}: мусор от Word XML`);
      // баланс парных тегов
      for (const tag of ["p", "ul", "table", "h2"]) {
        const open = (item.html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
        const close = (item.html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
        assert.equal(open, close, `${setFile}/${item.id}: <${tag}> открытых ${open}, закрытых ${close}`);
      }
    }
  });
}
