/**
 * Импорт персонального календаря (iCal): парсер VEVENT и привязка к темам.
 *
 * Проверяем на реальном фрагменте фида ЭИОС из аудита: UID → external_id,
 * SUMMARY «Предмет: Тема», DTSTART/DTEND в настенном времени Владивостока.
 *
 * Run: node --test test/ical.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const source = await readFile(new URL("../workers/api/src/lib/ical.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleShim = { exports: {} };
new Function("exports", "require", "module", js)(moduleShim.exports, require_, moduleShim);
const { parseIcal, splitTitle, titleSimilarity, matchByTitle, contentHash, unfold } = moduleShim.exports;

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//DVGMU//EIOS//RU",
  "BEGIN:VEVENT",
  "UID:eios-2026-biohim-lecture-15",
  "DTSTART:20261015T090000",
  "DTEND:20261015T103000",
  "SUMMARY:Биохимия: Белки — структура и функции",
  "LOCATION:ауд. 302",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("VEVENT → событие с UID, временем Владивостока и местом", () => {
  const events = parseIcal(FEED);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.uid, "eios-2026-biohim-lecture-15");
  assert.equal(event.summary, "Биохимия: Белки — структура и функции");
  // 09:00 по Владивостоку (UTC+10) — это 23:00 предыдущего дня в UTC.
  assert.equal(event.startsAt, "2026-10-14T23:00:00.000Z");
  assert.equal(event.endsAt, "2026-10-15T00:30:00.000Z");
  assert.equal(event.location, "ауд. 302");
  assert.equal(event.allDay, false);
});

test("SUMMARY делится на предмет и тему", () => {
  assert.deepEqual(splitTitle("Биохимия: Белки — структура и функции"), {
    subject: "Биохимия",
    topic: "Белки — структура и функции",
  });
  assert.deepEqual(splitTitle("Лекция. Физиология: Кровь"), {
    subject: "Физиология",
    topic: "Кровь",
  });
  assert.deepEqual(splitTitle("Биохимия — Ферменты"), {
    subject: "Биохимия",
    topic: "Ферменты",
  });
  assert.deepEqual(splitTitle("Гистология"), { subject: "Гистология", topic: "" });
});

test("UTC-время и события на весь день читаются без сдвига", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:utc-1",
    "DTSTART:20261231T210000Z",
    "SUMMARY:Экзамен: Биохимия",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:allday-1",
    "DTSTART;VALUE=DATE:20261101",
    "SUMMARY:Сессия",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const events = parseIcal(feed);
  assert.equal(events[0].startsAt, "2026-12-31T21:00:00.000Z");
  assert.equal(events[0].endsAt, null);
  assert.equal(events[1].allDay, true);
  assert.equal(events[1].startsAt, "2026-10-31T14:00:00.000Z");
});

test("перенесённые строки (RFC 5545) склеиваются, экранирование раскрывается", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:folded-1",
    "DTSTART:20261016T080000",
    "SUMMARY:Физиология: Пищеварение, обмен веществ и терморег",
    " уляция",
    "DESCRIPTION:Первая строка\\nВторая строка",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const events = parseIcal(feed);
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, "Физиология: Пищеварение, обмен веществ и терморегуляция");
  assert.equal(events[0].description, "Первая строка\nВторая строка");
  // Перенос строки удаляется вместе с пробелом-маркером, половины склеиваются.
  assert.deepEqual(unfold("A:1\n 2"), ["A:12"]);
});

test("битые VEVENT пропускаются, а не ломают импорт целиком", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:no-start",
    "SUMMARY:Без даты",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:ok",
    "DTSTART:20261017T090000",
    "SUMMARY:Гистология: Цитология",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const events = parseIcal(feed);
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, "ok");
});

test("похожесть тем: соседние формулировки матчатся, чужие — нет", () => {
  const candidates = [
    { id: "1", title: "Строение и функции белков" },
    { id: "2", title: "Ферменты и кинетика" },
    { id: "3", title: "Обмен углеводов" },
  ];
  assert.ok(titleSimilarity("Белки — структура и функции", "Строение и функции белков") >= 0.55);
  const match = matchByTitle("Белки — структура и функции", candidates, (item) => item.title, 0.55);
  assert.equal(match?.item.id, "1");
  assert.ok(titleSimilarity("Ферменты", "Обмен углеводов") < 0.3);
  assert.equal(matchByTitle("Кровь", candidates, (item) => item.title, 0.55), null);
});

test("content_hash детерминирован и меняется при смене времени", () => {
  const base = ["Биохимия: Белки", "ауд. 302", "2026-10-15T00:00:00.000Z", null, null];
  assert.equal(contentHash(base), contentHash(base));
  assert.notEqual(contentHash(base), contentHash(["Биохимия: Белки", "ауд. 302", "2026-10-22T00:00:00.000Z", null, null]));
});
