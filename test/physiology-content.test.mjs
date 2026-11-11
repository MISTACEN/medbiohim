import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const CONTENT = new URL("public/content/physiology/", ROOT);

function readJson(name) {
  return JSON.parse(readFileSync(new URL(name, CONTENT), "utf8"));
}

const index = readJson("index.json");

test("physiology index lists every manual with an existing source file", () => {
  assert.equal(index.subject, "physiology");
  assert.equal(index.manuals.length, 7);
  for (const manual of index.manuals) {
    assert.ok(manual.slug, "manual slug");
    assert.ok(manual.title.length > 5, `${manual.slug}: title`);
    assert.ok(manual.hours > 0, `${manual.slug}: hours`);
    const file = new URL("public/" + manual.source_url.replace(/^\//, ""), ROOT);
    assert.ok(existsSync(file), `${manual.slug}: source file missing`);
    assert.ok(existsSync(new URL("public/" + manual.file.replace(/^\//, ""), ROOT)), `${manual.slug}: content json missing`);
  }
  assert.ok(existsSync(new URL("public/" + index.reference.url.replace(/^\//, ""), ROOT)), "reference pdf missing");
});

for (const summary of index.manuals) {
  const manual = readJson(`${summary.slug}.json`);

  test(`${summary.slug}: lessons are unique and populated`, () => {
    assert.ok(manual.lessons.length >= 3, "expected several lessons");
    const ids = new Set();
    for (const lesson of manual.lessons) {
      assert.ok(!ids.has(lesson.id), `duplicate lesson id ${lesson.id}`);
      ids.add(lesson.id);
      assert.ok(lesson.title.length > 8, `${lesson.id}: title`);
      assert.ok(
        lesson.questions.length + lesson.practical.length + lesson.situational.length > 0,
        `${lesson.id}: no content`
      );
    }
    for (const section of manual.sections) {
      assert.ok(section.lesson_ids.length > 0, `section ${section.number} is empty`);
      for (const id of section.lesson_ids) assert.ok(ids.has(id), `section references unknown ${id}`);
    }
  });

  test(`${summary.slug}: every question is well formed`, () => {
    const banks = [...manual.banks, ...manual.lessons.flatMap((lesson) => lesson.tests)];
    let total = 0;
    for (const bank of banks) {
      for (const question of bank.questions) {
        total += 1;
        assert.ok(question.text.length > 5, `${summary.slug}: empty question text`);
        assert.ok(question.options.length >= 2, `${summary.slug}: question without options`);
        if (question.answer) {
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
    assert.equal(total, manual.stats.questions, `${summary.slug}: stats mismatch`);
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

  test(`${summary.slug}: final colloquium is wired and has a mixed test`, () => {
    assert.ok(manual.final_lesson_id, `${summary.slug}: final_lesson_id missing`);
    const final = manual.lessons.find((lesson) => lesson.id === manual.final_lesson_id);
    assert.ok(final, `${summary.slug}: final lesson ${manual.final_lesson_id} not found`);
    const pool = [...manual.banks, ...manual.lessons.flatMap((lesson) => lesson.tests)].flatMap(
      (group) => group.questions
    );
    assert.ok(pool.length > 0, `${summary.slug}: no tests for the mixed final`);
  });
}
