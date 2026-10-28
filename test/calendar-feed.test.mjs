/**
 * FA2: экспорт расписания в iCalendar и подписной токен.
 *
 * Проверяем то, что потом увидит Google Calendar: корректный UTC, экранирование,
 * перенос строк по 75 октетов и HMAC-ссылку, которую нельзя подделать.
 *
 * Run: node --test test/calendar-feed.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

async function loadModule(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportsShim = {};
  const moduleShim = { exports: exportsShim };
  const requireShim = (id) => (id in dependencies ? dependencies[id] : require_(id));
  new Function("exports", "require", "module", js)(exportsShim, requireShim, moduleShim);
  return moduleShim.exports;
}

const ical = await loadModule("../workers/api/src/lib/ical.ts");
const feed = await loadModule("../workers/api/src/lib/calendar-feed.ts", { "./ical": ical });

const ENTRY = {
  id: "a1000001-0000-4000-8000-000000000001",
  date: "2026-10-15",
  start_time: "09:00:00",
  end_time: "10:30:00",
  subject_name: "Биохимия: Белки",
  room: "302",
  building: "корпус 1",
  notes: "лекция",
  teacher: "Иванова И.И.",
  type: "lecture",
  is_cancelled: false,
};

test("VEVENT получает UTC-время Владивостока и стабильный UID", () => {
  const calendar = feed.buildCalendar([ENTRY], { calendarName: "Медбиохим", now: new Date("2026-10-01T00:00:00Z") });
  assert.match(calendar, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendar, /\r\nEND:VCALENDAR$/);
  assert.match(calendar, /UID:a1000001-0000-4000-8000-000000000001@medbiohim/);
  // 09:00 по Владивостоку = 23:00 предыдущего дня UTC.
  assert.match(calendar, /DTSTART:20261014T230000Z/);
  assert.match(calendar, /DTEND:20261015T003000Z/);
  assert.match(calendar, /DTSTAMP:20261001T000000Z/);
  assert.match(calendar, /LOCATION:корпус 1\\, 302/);
  assert.match(calendar, /SUMMARY:Биохимия: Белки/);
  assert.match(calendar, /DESCRIPTION:lecture · Иванова И\.И\. · лекция/);
  assert.match(calendar, /X-WR-TIMEZONE:Asia\/Vladivostok/);
});

test("отменённое занятие помечается STATUS:CANCELLED", () => {
  const calendar = feed.buildCalendar([{ ...ENTRY, is_cancelled: true }], { calendarName: "x" });
  assert.match(calendar, /STATUS:CANCELLED/);
});

test("текст экранируется по RFC 5545, а строки переносятся по 75 октетов", () => {
  const summary = "Биохимия, обмен веществ; контроль — очень длинное название темы, которое точно не влезет в одну строку";
  const calendar = feed.buildCalendar([{ ...ENTRY, subject_name: summary, notes: "первая\nвторая" }], { calendarName: "x" });
  assert.match(calendar, /SUMMARY:Биохимия\\, обмен веществ\\; контроль/);
  assert.match(calendar, /DESCRIPTION:lecture · Иванова И\.И\. · первая\\nвторая/);

  const encoder = new TextEncoder();
  for (const line of calendar.split("\r\n")) {
    assert.ok(encoder.encode(line).length <= 75, `line too long: ${line.length} chars`);
  }
  // Перенос — часть форматирования, а не текста: развёрнутая строка возвращает исходник.
  const unfolded = calendar.replace(/\r\n /g, "");
  assert.match(unfolded, /SUMMARY:Биохимия\\, обмен веществ\\; контроль — очень длинное название темы/);
});

test("запись без валидной даты пропускается, а не ломает фид", () => {
  const calendar = feed.buildCalendar([{ ...ENTRY, id: "bad", date: "не дата" }, ENTRY], { calendarName: "x" });
  assert.equal(calendar.split("BEGIN:VEVENT").length - 1, 1);
});

test("подписной токен проверяется через HMAC и не подделывается", async () => {
  const secret = "test-secret";
  const token = await feed.signFeedToken("a1000001-0000-4000-8000-000000000001", secret);
  assert.equal(await feed.verifyFeedToken(token, secret), "a1000001-0000-4000-8000-000000000001");
  assert.equal(await feed.verifyFeedToken(token, "другой-секрет"), null);

  const [userId, signature] = token.split(":");
  const forged = `${userId}:${signature.replace(/^./, signature[0] === "a" ? "b" : "a")}`;
  assert.equal(await feed.verifyFeedToken(forged, secret), null);

  const anotherUser = `b1000001-0000-4000-8000-000000000002:${signature}`;
  assert.equal(await feed.verifyFeedToken(anotherUser, secret), null);
  assert.equal(await feed.verifyFeedToken("мусор", secret), null);
});
