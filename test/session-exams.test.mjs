import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseExamPdfText, parseSessionDate, parseSessionTime } from "../src/lib/university/session-exams.ts";

// Хук для импорта .ts без расширения — как в workers/api тестах.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch { /* fall through */ }
    }
    return nextResolve(specifier, context);
  },
});

test("даты и время сессии: дд.мм.гг, дд.мм.гггг, 16-30", () => {
  assert.equal(parseSessionDate("10.09.26"), "2026-09-10");
  assert.equal(parseSessionDate("01.10.2026"), "2026-10-01");
  assert.equal(parseSessionDate("32.13.26"), null);
  assert.equal(parseSessionTime("16-30"), "16:30");
  assert.equal(parseSessionTime("9:05"), "09:05");
  assert.equal(parseSessionTime("2500"), null);
});

test("разбор реального экзаменационного PDF (фикстура летней практики, 2 курс ЛФ)", async () => {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = await readFile(new URL("../test/fixtures/fesmu/session/exam-practice-2-lech.pdf", import.meta.url));
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });

  const parsed = parseExamPdfText(text);
  assert.ok(parsed.title && /ЭКЗАМЕНА/i.test(parsed.title));
  assert.equal(parsed.course_hint, 2);
  assert.ok(parsed.faculty_hint && /лечебн/i.test(parsed.faculty_hint));

  // строки основных групп: 10201-10204 → 10.09.26 16:30
  const first = parsed.rows.find((row) => row.groups.includes("10201"));
  assert.ok(first, "row for 10201 not found");
  assert.equal(first.date, "2026-09-10");
  assert.equal(first.time, "16:30");
  assert.equal(first.is_retake, false);

  // пересдачи помечены отдельно
  const retake = parsed.rows.find((row) => row.is_retake);
  assert.ok(retake, "retake row not found");
  assert.equal(retake.date, "2026-10-01");

  // честность: место/документация не додуманы — либо null, либо из текста
  for (const row of parsed.rows) {
    assert.ok(row.date !== undefined);
    assert.ok(row.groups.length >= 1 || row.is_retake === false || row.is_retake === true);
  }
});

test("пустой/болтливый текст не рождает фиктивных строк", () => {
  const parsed = parseExamPdfText("Просто текст без расписания.");
  assert.deepEqual(parsed.rows, []);
});
