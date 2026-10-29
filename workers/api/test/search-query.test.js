import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesMaterialHint,
  parseSearchIntent,
  scoreFields,
  searchTokens,
  stemToken,
} from "../src/lib/search-query.ts";

test("нормализация и стемминг: «гистологии» совпадает с «Гистология»", () => {
  assert.equal(stemToken("Гистология"), "гистолог");
  assert.equal(stemToken("гистологии"), "гистолог");
  assert.equal(stemToken("печень"), "печен");
  assert.equal(stemToken("печени"), "печен");
  assert.equal(stemToken("биохимии"), "биохим");
  assert.deepEqual(searchTokens("учебник по гистологии"), ["учебник", "гистолог"]);
  assert.deepEqual(searchTokens("препарат печень"), ["препарат", "печен"]);
});

test("оценка: точная фраза выше частичного совпадения", () => {
  const exact = scoreFields(["Гистология, цитология"], "гистология");
  const partial = scoreFields(["Гистология, цитология"], "гистологии");
  assert.ok(exact > partial, `${exact} > ${partial}`);
  assert.equal(scoreFields(["Биохимия"], "гистология"), 0);
  assert.ok(scoreFields(["Гистология"], "") === 0);
});

test("оценка собирает слова из разных полей: «учебник по гистологии»", () => {
  const textbook = scoreFields(
    ["Гистология, цитология и эмбриология — учебник (Афанасьев Ю.И.)", "Гистология, цитология"],
    "учебник по гистологии",
  );
  const unrelated = scoreFields(["Атлас по гистологии"], "учебник по гистологии");
  assert.ok(textbook >= 60, `учебник должен находиться: ${textbook}`);
  assert.ok(textbook > unrelated, "учебник с обоими словами выше атласа");
  assert.equal(scoreFields(["Биохимия", "Биохимия"], "учебник по гистологии"), 0);
});

test("разбор намерения: препарат, учебник, лекции", () => {
  assert.deepEqual(parseSearchIntent("препарат печень"), {
    kind: "preparations", query: "печень", normalized: "препарат печень",
    materialHint: undefined, hint: "ищем микропрепарат",
  });
  const textbook = parseSearchIntent("учебник по гистологии");
  assert.equal(textbook.kind, "materials");
  // «Учебник» — вид материала, а не слово названия: иначе запрос
  // «учебник по физиологии» приносил бы учебники по гистологии.
  assert.equal(textbook.query, "гистологии");
  assert.equal(textbook.materialHint, "учебник");
  assert.equal(parseSearchIntent("атлас гистология").materialHint, "атлас");
  const onlyKind = parseSearchIntent("учебники");
  assert.equal(onlyKind.kind, "materials");
  assert.equal(onlyKind.query, "");
  assert.equal(onlyKind.materialHint, "учебник");
  assert.equal(parseSearchIntent("лекции физиология").kind, "lectures");
  assert.equal(parseSearchIntent("билеты по биохимии").kind, "tickets");
  assert.equal(parseSearchIntent("гистология").kind, undefined);
  assert.equal(parseSearchIntent("").query, "");
});

test("вид материала: учебник, атлас и сокращённая методичка", () => {
  assert.equal(matchesMaterialHint(["Гистология — учебник (Афанасьев)"], "учебник"), true);
  assert.equal(matchesMaterialHint(["Атлас по гистологии"], "учебник"), false);
  assert.equal(matchesMaterialHint(["метод.по нервн кровен, кроветв.леч", "docx"], "методич"), true);
  assert.equal(matchesMaterialHint(["Сборник тестов"], "методич"), false);
});

test("предметный запрос сохраняется, служебные слова выбрасываются", () => {
  const intent = parseSearchIntent("учебник для гистологии");
  assert.equal(intent.query, "гистологии");
  assert.equal(intent.kind, "materials");
  assert.equal(intent.materialHint, "учебник");
});
