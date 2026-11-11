import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const CONTENT = new URL("public/content/histology/", ROOT);
// Корень исходных документов кафедры (то же значение, что в
// tools/histology/build_content.py; переопределяется HISTOLOGY_SOURCES)
const SOURCES_ROOT =
  process.env.HISTOLOGY_SOURCES || "C:\\Users\\MISTACEN\\Desktop\\Гистология";

function readJson(name) {
  return JSON.parse(readFileSync(new URL(name, CONTENT), "utf8"));
}

const index = readJson("index.json");

test("histology index lists exactly three manuals with existing files", () => {
  assert.equal(index.subject, "histology");
  assert.equal(index.manuals.length, 3);
  assert.deepEqual(
    index.manuals.map((m) => m.slug).sort(),
    ["chastnaya-gistologiya", "citologiya-embriologiya", "obschaya-gistologiya"]
  );
  if (!existsSync(SOURCES_ROOT)) return; // исходники кафедры есть не на каждой машине
  for (const manual of index.manuals) {
    assert.ok(manual.slug, "manual slug");
    assert.ok(manual.title.length > 5, `${manual.slug}: title`);
    assert.ok(manual.subtitle.length > 5, `${manual.slug}: subtitle`);
    assert.equal(manual.semester, 3, `${manual.slug}: semester`);
    assert.equal(manual.year, 2026, `${manual.slug}: year`);
    assert.ok(manual.hours > 0, `${manual.slug}: hours`);
    assert.ok(manual.source.title.length > 5, `${manual.slug}: source title`);
    const sourceFile = path.join(SOURCES_ROOT, manual.source.file);
    assert.ok(existsSync(sourceFile), `${manual.slug}: source file missing`);
    assert.ok(
      existsSync(new URL(manual.content, CONTENT)),
      `${manual.slug}: content json missing`
    );
  }
});

for (const summary of index.manuals) {
  const manual = readJson(summary.content);

  test(`${summary.slug}: manual matches its index summary`, () => {
    assert.equal(manual.slug, summary.slug);
    assert.equal(manual.title, summary.title);
    assert.equal(manual.semester, summary.semester);
    assert.equal(manual.year, summary.year);
    assert.equal(manual.hours, summary.hours);
    assert.ok(Array.isArray(manual.banks) && manual.banks.length > 0, "no banks");
  });

  test(`${summary.slug}: every question is well formed`, () => {
    let total = 0;
    let answered = 0;
    for (const bank of manual.banks) {
      assert.ok(bank.title.length >= 4, `${summary.slug}: bank title`);
      const open = bank.kind === "open";
      const numbers = new Set();
      for (const question of bank.questions) {
        total += 1;
        assert.ok(question.text.length > 5, `${summary.slug}: empty question text`);
        assert.ok(!numbers.has(question.number), `${summary.slug}: duplicate question number ${question.number}`);
        numbers.add(question.number);
        if (open) {
          assert.ok(question.answer, `${summary.slug}: open question without etalon`);
          assert.deepEqual(question.options, [], `${summary.slug}: open question with options`);
          answered += 1;
        } else {
          assert.ok(question.options.length >= 2, `${summary.slug}: question without options`);
          if (question.answer) {
            answered += 1;
            for (const part of question.answer.split(",")) {
              const value = Number(part);
              assert.ok(
                Number.isInteger(value) && value >= 1 && value <= question.options.length,
                `${summary.slug}: answer ${question.answer} out of range (${question.options.length} options)`
              );
            }
          }
        }
      }
    }
    assert.equal(total, manual.stats.questions, `${summary.slug}: stats.questions mismatch`);
    assert.equal(answered, manual.stats.answered, `${summary.slug}: stats.answered mismatch`);
  });

  test(`${summary.slug}: bank subsections cover every question once`, () => {
    for (const bank of manual.banks) {
      if (!bank.subsections || bank.subsections.length === 0) continue;
      const seen = new Set();
      for (const subsection of bank.subsections) {
        const questions = bank.questions.filter(
          (question) => question.number >= subsection.from && question.number <= subsection.to
        );
        assert.ok(questions.length > 0, `${summary.slug}: empty subsection ${subsection.title}`);
        for (const question of questions) {
          assert.ok(!seen.has(question.number), `${summary.slug}: question ${question.number} in two subsections`);
          seen.add(question.number);
        }
      }
      assert.equal(seen.size, bank.questions.length, `${summary.slug}: subsections do not cover the bank`);
    }
  });

  test(`${summary.slug}: answer coverage is at least 90%`, () => {
    const coverage = manual.stats.answered / Math.max(1, manual.stats.questions);
    assert.ok(coverage >= 0.9, `${summary.slug}: answer coverage ${(coverage * 100).toFixed(1)}%`);
  });
}
