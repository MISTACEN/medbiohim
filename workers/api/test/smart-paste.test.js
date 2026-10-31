import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

// Импорт TS-исходника воркера напрямую — как в course-rollover.test.js.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through */
      }
    }
    return nextResolve(specifier, context);
  },
});

const { smartPasteParse } = await import("../src/lib/smart-paste");

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("smart paste: дедлайн, чек-лист и критерии из чата старосты", () => {
  const raw = [
    "Дз на 02.10.",
    "ТЕМА: Эмбриология.",
    "1. Лекцию учим.",
    "2. Написать файлик с вопросами.",
    "Критерии оценок:",
    "5 — всё сдано вовремя.",
    "4 — с недочётами.",
  ].join("\n");
  const parsed = smartPasteParse(raw, new Date("2026-09-28T12:00:00Z"));

  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, "Эмбриология.");
  assert.equal(parsed.dueDate, "2026-10-02");
  assert.equal(parsed.checklist.length, 2);
  assert.match(parsed.checklist[0], /Лекцию учим/);
  assert.ok(parsed.criteria && parsed.criteria.includes("5 — всё сдано вовремя"));
});

test("smart paste: месяцы словами и год по ближайшей будущей дате", () => {
  const parsed = smartPasteParse("Сдать конспект до 15 октября", new Date("2026-09-28T12:00:00Z"));
  assert.equal(parsed.dueDate, "2026-10-15");
  // прошлогодняя дата переносится на следующий год, а не в прошлое
  const past = smartPasteParse("Сдать конспект до 15 января", new Date("2026-11-01T12:00:00Z"));
  assert.equal(past.dueDate, "2027-01-15");
});

test("smart paste: честный отказ, когда распознавать нечего", () => {
  const parsed = smartPasteParse("всем привет, как дела?", new Date("2026-09-28T12:00:00Z"));
  assert.equal(parsed.ok, false);
  assert.ok(parsed.reason && /не удалось распознать/i.test(parsed.reason));
  // и «до пятницы» не додумывается — даты без явного числа игнорируются
  const vague = smartPasteParse("ДЗ: сдать до пятницы. Тема: Ферменты.", new Date("2026-09-28T12:00:00Z"));
  assert.equal(vague.ok, true);
  assert.equal(vague.dueDate, null);
  assert.equal(vague.title, "Ферменты.");
});

test("контракт: POST /homeworks/smart-parse — requireAuth, лимит длины, честная 422", async () => {
  const routes = await source("../src/routes/homework.ts");
  assert.match(routes, /homework\.post\("\/smart-parse"/);
  const start = routes.indexOf('homework.post("/smart-parse"');
  const body = routes.slice(start, start + 1200);
  assert.match(body, /requireAuth/);
  assert.match(body, /VALIDATION_ERROR/);
  assert.match(body, /smartPasteParse/);
  // парсер — чистая функция без AI: только правила
  const parser = await source("../src/lib/smart-paste.ts");
  assert.ok(!/fetch\(|openai|gemini|gigachat/i.test(parser));
});
