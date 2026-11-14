import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { cleanCitationNoise, ensureCitationFootnotes, formatAnswer } from "../src/lib/ai-citations.ts";

const citations = [
  { n: 1, title: "Физиология форменных элементов крови" },
  { n: 2, title: "Гемостаз" },
];

test("без источников текст не меняется", () => {
  assert.equal(ensureCitationFootnotes("Гемолиз — разрушение эритроцитов.", []), "Гемолиз — разрушение эритроцитов.");
  assert.equal(ensureCitationFootnotes("Гемолиз — разрушение эритроцитов.", null), "Гемолиз — разрушение эритроцитов.");
  assert.equal(ensureCitationFootnotes("", citations), "");
  assert.equal(ensureCitationFootnotes("   ", citations), "");
});

test("если модель уже поставила сноски, ничего не добавляется", () => {
  const text = "Гемолиз — разрушение эритроцитов [1]. Бывает осмотический [2].";
  assert.equal(ensureCitationFootnotes(text, citations), text);
});

test("без сносок в конце появляются номера тех же источников", () => {
  const out = ensureCitationFootnotes("Гемолиз — разрушение эритроцитов.", citations);
  assert.equal(
    out,
    "Гемолиз — разрушение эритроцитов.\n\nИсточники: [1] Физиология форменных элементов крови; [2] Гемостаз",
  );
  assert.match(out, /\[1\]/);
  assert.match(out, /\[2\]/);
});

test("мусорные цитаты отбрасываются", () => {
  const out = ensureCitationFootnotes("Ответ.", [
    { n: 1, title: "  " },
    { n: Number.NaN, title: "Мусор" },
    { n: 3, title: " Гемостаз " },
  ]);
  assert.equal(out, "Ответ.\n\nИсточники: [3] Гемостаз");
  // Все цитаты непригодны — текст остаётся как есть, пустая строка не появляется.
  assert.equal(ensureCitationFootnotes("Ответ.", [{ n: 1, title: "" }]), "Ответ.");
});

test("словесные метки в скобках вырезаются, цифры и обычный текст остаются", () => {
  assert.equal(
    cleanCitationNoise("Кровь [Bl] — соединительная ткань [1]. Поддержка [Skel] тела."),
    "Кровь — соединительная ткань [1]. Поддержка тела.",
  );
  // Скобки с пробелами/знаками — обычный текст, не трогаем.
  assert.equal(cleanCitationNoise("Смотри [см. выше] и [1]."), "Смотри [см. выше] и [1].");
  // Пустые метки не оставляют двойных пробелов и отрыва пунктуации.
  assert.equal(cleanCitationNoise("Ответ [Soi] ."), "Ответ.");
});

test("formatAnswer чистит мусор и гарантирует сноски", () => {
  const out = formatAnswer("Кровь [Bl] — соединительная ткань.", citations);
  assert.equal(
    out,
    "Кровь — соединительная ткань.\n\nИсточники: [1] Физиология форменных элементов крови; [2] Гемостаз",
  );
  // Если модель оставила настоящие сноски — Добавка не нужна.
  assert.equal(formatAnswer("Кровь — ткань [2].", citations), "Кровь — ткань [2].");
});

test("маршрут применяет сноски и на чате, и в истории сообщений", async () => {
  const route = await readFile(new URL("../src/routes/ai.ts", import.meta.url), "utf8");
  assert.match(route, /content: formatAnswer\(result\.text, citations\)/);
  assert.match(route, /generated = \{ \.\.\.generated, text: formatAnswer\(generated\.text, rag\.citations\) \}/);
  // Инструкция о сносках повторена после фрагментов — модель лучше слушает конец.
  assert.match(route, /НАПОМИНАНИЕ: в тексте ответа после каждого утверждения из фрагмента обязателен его номер/);
  // И прямо запрещает слова в квадратных скобках.
  assert.match(route, /В квадратных скобках — только цифра, без слов и пометок/);
  assert.match(route, /В квадратных скобках пиши только номер цифрой/);
});

test("второй проход идёт на быстрой модели и не выдаёт 502 сразу", async () => {
  const route = await readFile(new URL("../src/routes/ai.ts", import.meta.url), "utf8");
  assert.match(route, /const FAST_WORKERS_AI_MODEL = "@cf\/meta\/llama-3\.2-3b-instruct"/);
  assert.match(route, /maxTokens: 400, timeoutMs: 12000, model: FAST_WORKERS_AI_MODEL/);
  const lib = await readFile(new URL("../src/lib/workers-ai.ts", import.meta.url), "utf8");
  assert.match(lib, /const model = String\(options\.model \|\| ""\)\.trim\(\) \|\| workersAiModel\(env\)/);
});
