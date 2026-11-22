/**
 * Повторы вопросов внутри одного банка.
 *
 * Импорт методичек приносит один вопрос дважды: разные id, одинаковый текст,
 * отличаются только числом подчёркиваний в пропуске, регистром или точкой в
 * конце. Студент видит такой вопрос дважды и получает двойной вес в результате,
 * поэтому при сборке прохождения строки склеиваются по ключу формулировки.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { questionTextKey } from "../integrations/cloudflare-api/src/question-text-key.js";

test("варианты одного вопроса с «_____» и «______» дают одинаковый ключ", () => {
  const a = "Учащение ударов по связке коленной чашечки тормозит разгибание колена, т.к. в двигательном центре развивается торможение _____.";
  const b = "Учащение ударов по связке коленной чашечки тормозит разгибание колена, т.к. в двигательном центре развивается торможение ______.";
  assert.equal(questionTextKey(a), questionTextKey(b));
});

test("регистр первой буквы и точка в конце не делают вопрос новым", () => {
  const a = "оценить уровень самоподготовки по ответам на контрольные вопросы";
  const b = "Оценить уровень самоподготовки по ответам на контрольные вопросы.";
  assert.equal(questionTextKey(a), questionTextKey(b));
});

test("разные вопросы остаются разными", () => {
  assert.notEqual(
    questionTextKey("Какие факторы приводят к появлению ядерных эритроцитов?"),
    questionTextKey("Какие факторы приводят к появлению базофильной зернистости?"),
  );
});

test("ключ не зависит от лишних пробелов и переносов строк", () => {
  assert.equal(questionTextKey("  Кровь\n и  лимфа "), questionTextKey("кровь и лимфа"));
});

test("сборка прохождения склеивает повторы до снимка попытки", async () => {
  const source = await fs.readFile(
    new URL("../integrations/cloudflare-api/src/planner.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /import \{ questionTextKey \} from "\.\/question-text-key\.js"/);
  assert.ok(source.includes("const seenQuestionText = new Set()"), "нужен набор уже взятых формулировок");
  assert.ok(source.includes("if (seenQuestionText.has(key)) return false"), "повтор должен отбрасываться");
  // Снимок попытки строится по отфильтрованным id, иначе повтор всё равно попадёт на экран.
  const dedupeAt = source.indexOf("seenQuestionText.has(key)");
  const snapshotAt = source.indexOf("const snapshot = ids.map((id) => {");
  assert.ok(dedupeAt > 0 && snapshotAt > dedupeAt, "склейка должна идти до сборки снимка");
});
