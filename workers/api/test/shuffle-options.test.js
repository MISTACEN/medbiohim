/**
 * Серверная рандомизация вариантов: shuffleQuestionOptions в question-format.
 * Гарантии: мультiset вариантов сохраняется, correct едет с вариантом,
 * вопросы на порядок не трогаются, ключи переназначаются по позиции.
 * Run: node --test test/shuffle-options.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shuffleQuestionOptions, normalizeQuestion } from "../../../integrations/cloudflare-api/src/question-format.js";

const mcq = {
  type: "mcq",
  text: "Сколько будет 2+2?",
  answer: "4",
  is_closed: true,
  options: [
    { key: "А", label: "3", correct: false },
    { key: "Б", label: "4", correct: true },
    { key: "В", label: "5", correct: false },
    { key: "Г", label: "22", correct: false },
  ],
};

test("shuffleQuestionOptions сохраняет все варианты и флаг correct", () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const shuffled = shuffleQuestionOptions(mcq);
    assert.equal(shuffled.options.length, 4);
    // Тот же мультiset подписей и ровно один правильный вариант.
    const labels = shuffled.options.map((o) => o.label).sort();
    assert.deepEqual(labels, ["22", "3", "4", "5"]);
    const correct = shuffled.options.filter((o) => o.correct === true);
    assert.equal(correct.length, 1);
    assert.equal(correct[0].label, "4");
  }
});

test("shuffleQuestionOptions переназначает ключи по позиции (буквы)", () => {
  const shuffled = shuffleQuestionOptions(mcq);
  shuffled.options.forEach((option, index) => {
    assert.equal(option.key, "АБВГ"[index]);
  });
});

test("shuffleQuestionOptions переназначает ключи по позиции (цифры)", () => {
  const numeric = {
    ...mcq,
    options: mcq.options.map((o, i) => ({ ...o, key: String(i + 1) })),
  };
  const shuffled = shuffleQuestionOptions(numeric);
  shuffled.options.forEach((option, index) => {
    assert.equal(option.key, String(index + 1));
  });
});

test("shuffleQuestionOptions меняет порядок между вызовами (практически всегда)", () => {
  const first = shuffleQuestionOptions(mcq).options.map((o) => o.label).join("|");
  let sawDifference = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const next = shuffleQuestionOptions(mcq).options.map((o) => o.label).join("|");
    if (next !== first) { sawDifference = true; break; }
  }
  assert.ok(sawDifference, "30 вызовов дали одинаковый порядок — shuffle не работает");
});

test("вопросы на порядок (requires_order) не перемешиваются", () => {
  const ordered = {
    ...mcq,
    requires_order: true,
    order_indexes: [1, 0, 3, 2],
    options: mcq.options,
  };
  const result = shuffleQuestionOptions(ordered);
  assert.deepEqual(result.options, ordered.options);
});

test("открытые вопросы и одиночные варианты не трогаются", () => {
  const open = { ...mcq, is_closed: false, options: [] };
  assert.equal(shuffleQuestionOptions(open), open);
  const single = { ...mcq, options: [{ key: "А", label: "1", correct: true }] };
  assert.equal(shuffleQuestionOptions(single), single);
  assert.equal(shuffleQuestionOptions(null), null);
});

test("снимок после shuffle проходит повторную нормализацию с теми же correct-флагами", () => {
  // Путь подготовки: нормализация → shuffle → запись снимка → повторная
  // нормализация при выдаче/проверке. Флаги correct должны выжить.
  const raw = {
    type: "mcq",
    text: "Столица Франции?",
    answer: "Париж",
    options: ["Лондон", "Париж", "Берлин", "Мадрид"],
  };
  const normalized = normalizeQuestion(raw);
  const shuffled = shuffleQuestionOptions(normalized);
  const re = normalizeQuestion(shuffled);
  assert.equal(re.is_closed, true);
  const correctLabels = re.options.filter((o) => o.correct).map((o) => o.label);
  assert.deepEqual(correctLabels, ["Париж"]);
  assert.ok(re.correct_keys.every((key) => re.options.some((o) => o.key === key && o.correct)));
});
