import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const data = JSON.parse(readFileSync(new URL("data/chemistry/part1-collection-2026-11.json", root), "utf8"));
const questions = data.themes.flatMap((theme) => theme.questions.map((q) => ({ ...q, theme: theme.id })));

test("химия: 18 тем и 813 вопросов", () => {
  assert.equal(data.themes.length, 18);
  assert.equal(questions.length, 813);
});

test("химия: у каждого вопроса есть ключ", () => {
  const withoutAnswer = questions.filter((q) => !q.answer);
  assert.deepEqual(withoutAnswer.map((q) => `${q.theme}:${q.number}`), []);
});

test("химия: варианты mcq пронумерованы 1..N и ключ в диапазоне", () => {
  for (const q of questions.filter((item) => item.kind === "mcq")) {
    assert.ok(q.options.length >= 2, `${q.theme}:${q.number} без вариантов`);
    for (const index of q.answerIndexes) {
      assert.ok(index >= 1 && index <= q.options.length, `${q.theme}:${q.number} ключ ${index} вне вариантов`);
    }
  }
});

test("химия: соответствия имеют буквенные варианты и пары", () => {
  for (const q of questions.filter((item) => item.kind === "match")) {
    if (q.options.length > 0) {
      assert.ok(q.options.every((option) => /^[А-ЯЁ]\./.test(option)), `${q.theme}:${q.number} вариант без буквы`);
    }
    if (q.pairs.length > 0) {
      for (const pair of q.pairs) assert.ok(/[А-ЯЁA-Z]/.test(pair.key), `${q.theme}:${q.number} пара без буквы`);
    }
  }
});

test("химия: нет повторяющихся номеров внутри темы", () => {
  const seen = new Set();
  for (const q of questions) {
    const key = `${q.theme}:${q.number}`;
    assert.ok(!seen.has(key), `дубль ${key}`);
    seen.add(key);
  }
});
