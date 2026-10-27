import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuestion,
  extractOptionsFromText,
  gradeClosedAnswer,
  gradeOpenAnswer,
  normalizedAnswer,
} from "../src/question-format.js";

function labels(question) {
  return question.options.map((option) => option.label);
}

function correctLabels(question) {
  return question.options.filter((option) => option.correct).map((option) => option.label);
}

test("готовые флаги correct сохраняются, ответ показывается текстом варианта", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Какая фаза митоза?",
    answer: "3",
    options: [
      { label: "интерфаза", correct: false },
      { label: "профаза", correct: false },
      { label: "метафаза", correct: false },
      { label: "анафаза", correct: true },
      { label: "телофаза", correct: false },
    ],
  });
  assert.equal(question.is_closed, true);
  assert.deepEqual(correctLabels(question), ["анафаза"]);
  assert.equal(question.answer_display, "Г) анафаза");
  assert.equal(question.resolution, "options.correct");
});

test("0-based числовой эталон старых банков сопоставляется с вариантом", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Какова доля воды в плазме крови?",
    answer: "4",
    options: ["60-63 %", "50-53 %", "20-23 %", "70-73 %", "90-93 %"],
  });
  assert.deepEqual(correctLabels(question), ["90-93 %"]);
  assert.equal(question.resolution, "index-0");
  assert.equal(question.answer_display, "Д) 90-93 %");
});

test("читаемый эталон физиологии «Верный ответ: 2) …» сопоставляется по тексту", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Что происходит с рефлексом?",
    answer: "Верный ответ: 2) тормозится",
    options: ["удлиняется", "тормозится", "не изменяется", "углубляется"],
  });
  assert.deepEqual(correctLabels(question), ["тормозится"]);
  assert.equal(question.resolution, "readable");
  assert.equal(question.answer_display, "Б) тормозится");
});

test("хвостовая «;» и двойная «;;» в эталоне физиологии не ломают разбор", () => {
  const single = normalizeQuestion({
    type: "mcq",
    text: "Граница между продолговатым и спинным мозгом?",
    answer: "Верный ответ: 4) между С1 и С2;",
    options: ["выше моста", "между С7 и Т1;", "между продолговатым мозгом и мостом;", "между С1 и С2;", "ниже Т12"],
  });
  assert.deepEqual(correctLabels(single), ["между С1 и С2;"]);
  assert.equal(single.resolution, "readable");

  const multi = normalizeQuestion({
    type: "multiple",
    text: "Какие ионы преобладают?",
    answer: "Верный ответ: 1) натрия;; 4) кальция;",
    options: ["натрия;", "калия;", "магния;", "кальция;", "хлора."],
  });
  assert.deepEqual(correctLabels(multi), ["натрия;", "кальция;"]);
  assert.equal(multi.resolution, "readable");
});

test("инициалы «Г. Галилеем» не считаются маркером варианта", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Микроскоп был изобретён:",
    answer: "Г. Галилеем",
    options: ["Р. Гуком", "Г. Галилеем", "М. Мальпиги", "А. Левенгуком", "Я. Пуркинье"],
  });
  assert.deepEqual(labels(question), ["Р. Гуком", "Г. Галилеем", "М. Мальпиги", "А. Левенгуком", "Я. Пуркинье"]);
  assert.deepEqual(correctLabels(question), ["Г. Галилеем"]);
  assert.equal(question.resolution, "text");
});

test("варианты с собственной нумерацией 1)…5) используют номер как ключ (1-based)", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Название родоначальной структуры",
    answer: "3",
    options: ["1) бутен-2", "2) бутан", "3) пентан", "4) пентен-2", "5) гексан"],
  });
  assert.deepEqual(labels(question), ["бутен-2", "бутан", "пентан", "пентен-2", "гексан"]);
  assert.deepEqual(question.options.map((option) => option.key), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(correctLabels(question), ["пентан"]);
  assert.equal(question.resolution, "marker");
  assert.equal(question.answer_display, "3) пентан");
});

test("эталон, совпадающий с текстом варианта, важнее числовой догадки", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Производная константы равна:",
    answer: "0",
    options: ["0", "1", "самой константе", "не существует"],
  });
  assert.deepEqual(correctLabels(question), ["0"]);
  assert.equal(question.resolution, "text");

  const physics = normalizeQuestion({
    type: "mcq",
    text: "Единица силы",
    answer: "ньютон",
    options: ["джоуль", "ньютон", "ватт", "паскаль"],
  });
  assert.deepEqual(correctLabels(physics), ["ньютон"]);
  assert.equal(physics.resolution, "text");
});

test("буквенный эталон «В» сопоставляется с третьим вариантом", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Свойство, позволяющее различить энантиомеры",
    answer: "В",
    options: ["1) температура кипения", "2) температура плавления", "3) удельный вес", "4) показатель преломления", "5) удельное вращение"],
  });
  assert.deepEqual(correctLabels(question), ["удельный вес"]);
  assert.equal(question.resolution, "letter");
});

test("несколько правильных вариантов и 0-based эталон", () => {
  const question = normalizeQuestion({
    type: "multiple",
    text: "Выберите все признаки",
    answer: "0,2",
    options: ["первый", "второй", "третий", "четвёртый"],
  });
  assert.deepEqual(correctLabels(question), ["первый", "третий"]);
  assert.equal(question.allow_multiple, true);
  const graded = gradeClosedAnswer(question, ["А", "В"]);
  assert.equal(graded.is_correct, true);
});

test("вопрос на последовательность сохраняет порядок, а не набор", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Укажите ряд соединений в порядке увеличения кислотности",
    answer: "132",
    options: ["1) этанамин", "2) этанол", "3) этантиол"],
  });
  assert.deepEqual(question.order_indexes, [0, 2, 1]);
  assert.match(question.answer_display, /→/);
  assert.equal(gradeClosedAnswer(question, "132").is_correct, true);
  assert.equal(gradeClosedAnswer(question, "123").is_correct, false);
});

test("пустой эталон даёт pending, а не «неверно»", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Вопрос без эталона",
    answer: "",
    options: ["раз", "два"],
  });
  assert.deepEqual(correctLabels(question), []);
  assert.equal(question.resolved, false);
  assert.equal(gradeClosedAnswer(question, "А").is_correct, null);
});

test("варианты, записанные в тексте, распознаются только при разрешимом эталоне", () => {
  const extracted = extractOptionsFromText(
    "Какие клетки синтезируют антитела?\n1) нейтрофилы\n2) плазмоциты\n3) лимфоциты",
  );
  assert.ok(extracted);
  assert.equal(extracted.options.length, 3);
  assert.match(extracted.stem, /антитела/);

  const question = normalizeQuestion(
    {
      type: "mcq",
      text: "Какие клетки синтезируют антитела?\n1) нейтрофилы\n2) плазмоциты\n3) лимфоциты",
      answer: "2",
      options: [],
    },
    { extractTextOptions: true },
  );
  assert.deepEqual(labels(question), ["нейтрофилы", "плазмоциты", "лимфоциты"]);
  assert.deepEqual(correctLabels(question), ["плазмоциты"]);
  assert.doesNotMatch(question.text, /1\)/);
});

test("открытый ответ сравнивается без HTML и пунктуации", () => {
  assert.equal(gradeOpenAnswer("<strong>Зубная</strong> пластинка.", "зубная пластинка"), true);
  assert.equal(normalizedAnswer("ГЭБ — это..."), "гэб это");
});

test("клиент может отправить ключ варианта, а не его текст", () => {
  const question = normalizeQuestion({
    type: "mcq",
    text: "Выберите",
    answer: "1",
    options: ["раз", "два", "три"],
  });
  assert.equal(gradeClosedAnswer(question, ["Б"]).is_correct, true);
  assert.equal(gradeClosedAnswer(question, JSON.stringify(["два"])).is_correct, true);
  assert.equal(gradeClosedAnswer(question, ["В"]).is_correct, false);
});
