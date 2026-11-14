import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("exam answers export reads the published bank only", async () => {
  const route = await source("../src/routes/exam-questions.ts");
  assert.match(route, /examQuestions\.get\("\/export", requireAuth/);
  assert.match(route, /\.eq\("subject_slug", subject\)[\s\S]{0,160}\.eq\("for_exam", true\)[\s\S]{0,160}\.eq\("is_published", true\)/);
  // Без предмета — не «все предметы», а понятная ошибка.
  assert.match(route, /if \(!subject\) \{[\s\S]{0,200}422/);
  // Только чтение: выгрузка не пишет в базу.
  assert.doesNotMatch(route, /\.insert\(|\.upsert\(|\.update\(/);
});

test("export groups questions by topic and counts answers honestly", async () => {
  const route = await source("../src/routes/exam-questions.ts");
  assert.match(route, /const groupIndex = new Map<string, number>\(\)/);
  assert.match(route, /topic: String\(row\.topic \|\| ""\)\.trim\(\) \|\| null/);
  assert.match(route, /if \(answer\) answered \+= 1;/);
  // Обрезка не молчит: клиент получает флаг и пишет его в документ.
  assert.match(route, /truncated: total > rows\.length/);
  assert.match(route, /const EXPORT_MAX = 600;/);
});

test("frontend builds the .docx locally instead of storing it", async () => {
  const component = await source("../../../src/components/subjects/ExamAnswersDownload.tsx");
  assert.match(component, /buildExamAnswersDocx/);
  assert.match(component, /link\.download = examAnswersFileName/);
  const docx = await source("../../../src/lib/study/docx.ts");
  assert.match(docx, /\[Content_Types\]\.xml/);
  assert.match(docx, /word\/document\.xml/);
  assert.match(docx, /compression: "DEFLATE"/);
});
