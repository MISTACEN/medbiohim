import test from "node:test";
import assert from "node:assert/strict";

const identity = await import(new URL("../src/lib/groupIdentity.ts", import.meta.url).href);

const at = (iso) => new Date(`${iso}T12:00:00Z`);

test("Group identity: учебный год начинается 1 сентября", () => {
  assert.equal(identity.academicYearStart(at("2026-08-31")), 2025);
  assert.equal(identity.academicYearStart(at("2026-09-01")), 2026);
});

test("Group identity: курс считается от года поступления", () => {
  assert.equal(identity.autoCourse(2024, at("2026-10-30")), 3);
  assert.equal(identity.autoCourse(2024, at("2026-08-31")), 2);
  assert.equal(identity.autoCourse("2025", at("2026-09-01")), 2);
  assert.equal(identity.autoCourse(null), null);
  assert.equal(identity.autoCourse(1800), null);
});

test("Group identity: отображаемое имя вычисляется из курса и потока", () => {
  assert.equal(
    identity.groupDisplayName({ code: "МБХ-201", name: "МБХ 201", course: 2, stream: "1" }),
    "МБХ 201"
  );
  assert.equal(
    identity.groupDisplayName({ code: "МБХ-201", name: "МБХ 201", course: 2, stream: "2" }),
    "МБХ 202"
  );
  assert.equal(identity.groupDisplayName({ name: "МБХ 201" }), "МБХ 201", "без курса имя не выдумываем");
  assert.equal(identity.streamSuffix("поток 2"), "02");
  assert.equal(identity.streamSuffix(""), "01");
});

test("Group identity: персональная заморозка курса сильнее автоматики", () => {
  // Академотпуск: год поступления дал бы 3-й курс, но студент остаётся на 2-м.
  assert.deepEqual(
    identity.effectiveCourse({ admissionYear: 2024, storedCourse: 2, override: 2, date: at("2026-10-01") }),
    { course: 2, source: "override" }
  );
  assert.deepEqual(
    identity.effectiveCourse({ admissionYear: 2024, storedCourse: 2, date: at("2026-10-01") }),
    { course: 3, source: "auto" }
  );
  // Старая база без года поступления: показываем сохранённый курс, не 0.
  assert.deepEqual(
    identity.effectiveCourse({ admissionYear: null, storedCourse: 4 }),
    { course: 4, source: "stored" }
  );
});
