/**
 * Блок 1 бэклога: конвертация Workshop → банк вопросов.
 * Run: node --test test/question-convert.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as convert from "../src/lib/question-convert.ts";

const FILES = new Set(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);

test("draftQuestionsFromItem: сеет вопросы элемента и нумерованные строки OCR", () => {
  const drafts = convert.draftQuestionsFromItem({
    questions: [{ text: "Какой изомер соответствует спирту?", topic: "Спирты" }],
    ocrText: "1) Укажите структурный изомер бутанола\nВариант А\n2) Чем отличается альдегид от кетона",
  });
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].topic, "Спирты");
  assert.ok(drafts[1].text.startsWith("Укажите структурный"));
  assert.ok(drafts[2].text.startsWith("Чем отличается"));
});

test("draftQuestionsFromItem: дедуп и пустой вход", () => {
  const drafts = convert.draftQuestionsFromItem({
    questions: [{ text: "Вопрос один" }, { text: "вопрос  ОДИН" }],
  });
  assert.equal(drafts.length, 1);
  assert.deepEqual(convert.draftQuestionsFromItem({}), []);
});

test("draftQuestionsFromItem: структурный черновик автора несёт варианты и эталон", () => {
  const drafts = convert.draftQuestionsFromItem({
    questions: [{
      text: "Какой тут структурный изомер?",
      options: [
        { label: "бутанол-1", correct: true },
        { label: "бутанол-2", correct: false },
      ],
      answer: null,
    }],
  });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].options.length, 2);
  assert.equal(drafts[0].options[0].correct, true);
});

test("validateConvertedQuestions: закрытый вопрос с верным вариантом проходит", () => {
  const result = convert.validateConvertedQuestions([{
    text: "Какой тут структурный изомер?",
    options: [
      { label: "бутанол-1", correct: true, image_file_id: "11111111-1111-4111-8111-111111111111" },
      { label: "бутанол-2", correct: false, image_file_id: "22222222-2222-4222-8222-222222222222" },
    ],
  }], FILES);
  assert.equal(result.ok, true);
  assert.equal(result.questions[0].options.length, 2);
  assert.equal(result.questions[0].options[0].image_file_id, "11111111-1111-4111-8111-111111111111");
});

test("validateConvertedQuestions: картинка чужого элемента отклоняется", () => {
  const result = convert.validateConvertedQuestions([{
    text: "Вопрос",
    options: [
      { label: "а", correct: true, image_file_id: "99999999-9999-4999-8999-999999999999" },
      { label: "б", correct: false },
    ],
  }], FILES);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /не принадлежит/);
});

test("validateConvertedQuestions: без верного варианта — ошибка, не публикация", () => {
  const result = convert.validateConvertedQuestions([{
    text: "Вопрос",
    options: [{ label: "а" }, { label: "б" }],
  }], FILES);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /верным/);
});

test("validateConvertedQuestions: открытый вопрос требует эталон", () => {
  const missing = convert.validateConvertedQuestions([{ text: "Составьте уравнение", options: [] }], FILES);
  assert.equal(missing.ok, false);
  const withAnswer = convert.validateConvertedQuestions([{ text: "Составьте уравнение", options: [], answer: "C2H5OH + O2" }], FILES);
  assert.equal(withAnswer.ok, true);
});

test("validateConvertedQuestions: строки-варианты нормализуются (верный отмечен флагом)", () => {
  const result = convert.validateConvertedQuestions([{
    text: "Вопрос",
    options: ["привет ", "", { label: "пока", correct: true }],
  }], FILES);
  assert.equal(result.ok, true);
  assert.deepEqual(result.questions[0].options.map((o) => o.label), ["привет", "пока"]);
  assert.deepEqual(result.questions[0].options.map((o) => o.correct), [false, true]);
});

test("validateConvertedQuestions: пустой и слишком большой вход отклоняются", () => {
  assert.equal(convert.validateConvertedQuestions([], FILES).ok, false);
  assert.equal(convert.validateConvertedQuestions("nope", FILES).ok, false);
  const many = Array.from({ length: 201 }, () => ({ text: "x", options: [], answer: "y" }));
  assert.equal(convert.validateConvertedQuestions(many, FILES).ok, false);
});

test("роут конвертации смонтирован и проверяет права", async () => {
  const { readFile } = await import("node:fs/promises");
  const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../src/routes/admin-workshop-convert.ts", import.meta.url), "utf8");
  assert.ok(indexSource.includes('v1.route("/admin", adminWorkshopConvert)'));
  assert.ok(routeSource.includes('adminConvert.get("/workshop-questions/:itemId/draft"'));
  assert.ok(routeSource.includes('adminConvert.post("/workshop-questions/:itemId/convert"'));
  assert.ok(routeSource.includes('adminConvert.post("/workshop-questions/:itemId/reject"'));
  assert.ok(routeSource.includes('kind !== "test_questions"'));
  assert.ok(routeSource.includes('source: "workshop"'));
  assert.ok(routeSource.includes("source_item_id: itemId"));
  assert.ok(routeSource.includes('"mcq"'));
  assert.ok(routeSource.includes("question_conversion_status"));
  assert.ok(routeSource.includes("isModerator(c)"));
  assert.ok(!routeSource.includes("console.log("));
});
