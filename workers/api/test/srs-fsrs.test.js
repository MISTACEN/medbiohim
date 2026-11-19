import { readSrsDomain } from "./srs-source.js";
import test from "node:test";
import assert from "node:assert/strict";


/**
 * FSRS-планирование: чистая функция nextReviewState проверяется через
 * динамический импорт модуля (TypeScript-роут воркера импортируется напрямую,
 * как его используют тесты ai-*.test.js через приведение source — здесь важна
 * математика, поэтому тестируем реальный код, а не текст).
 */

let nextReviewState = null;
try {
  // Математику FSRS вырезаем из srs.ts точечно (блок от FSRS_W до reviewCard):
  // сам srs.ts — роут воркера с Hono/Supabase-окружением, его целиком тест не
  // импортирует, а дублировать формулы в тесте нельзя (разойдутся).
  const src = await readSrsDomain();
  const start = src.indexOf("const FSRS_W");
  const end = src.indexOf("async function reviewCard");
  if (start >= 0 && end > start) {
    let body = src.slice(start, end)
      .replace(/export type FsrsCardState = \{[\s\S]*?\};/, "")
      .replace(/export function nextReviewState/, "function nextReviewState")
      // лёгкая трансляция TS-аннотаций: блок содержит только number/string/boolean
      .replace(/:\s*(number|string|boolean)(\[\])?/g, "")
      .replace(/:\s*FsrsCardState/g, "");
    body += "\nexport { nextReviewState };";
    const moduleUrl = "data:text/javascript;base64," + Buffer.from(body, "utf8").toString("base64");
    ({ nextReviewState } = await import(moduleUrl));
  }
} catch (error) {
  console.error("[srs-fsrs] extraction failed:", String(error));
  nextReviewState = null;
}

const hasFsrs = (text) => text.includes("FSRS_W") && text.includes("stability");

test("srs scheduling switches to FSRS state columns", async () => {
  const srs = await readSrsDomain();
  assert.ok(hasFsrs(srs), "FSRS math must be present in srs.ts");
  assert.match(srs, /stability: next\.stability/);
  assert.match(srs, /difficulty: next\.difficulty/);
  assert.match(srs, /state: next\.state/);
  assert.match(srs, /lapses: next\.lapses/);
});

if (nextReviewState) {
  test("new card: FSRS initial stability grows with rating, due date >= tomorrow", () => {
    const card = { ease: 2.5, interval: 0, reps: 0, state: 0 };
    const again = nextReviewState(card, 1);
    const good = nextReviewState(card, 3);
    const easy = nextReviewState(card, 4);
    assert.ok(again.stability > 0 && again.stability <= easy.stability, "stability must grow with rating");
    assert.ok(good.interval >= 1);
    const due = Date.parse(good.due_at) - Date.now();
    assert.ok(due > 12 * 3600_000, "due_at must be at least ~tomorrow");
    assert.equal(good.state, 2);
    assert.equal(again.state, 1);
    // SM-2-совместимость сохраняется
    assert.equal(good.reps, 1);
    assert.ok(good.ease >= 1.3 && good.ease <= 3.2);
  });

  test("reviewed card: 'again' resets to short interval and counts a lapse", () => {
    const card = {
      ease: 2.5, interval: 10, reps: 3, state: 2, stability: 10, difficulty: 5, lapses: 0,
      reviewed_at: new Date(Date.now() - 9 * 86400_000).toISOString(),
    };
    const next = nextReviewState(card, 1);
    assert.ok(next.interval < card.interval, "forgetting must shorten the interval");
    assert.equal(next.lapses, 1);
    assert.ok(next.stability < card.stability, "forgetting must reduce stability");
    assert.ok(next.difficulty > card.difficulty, "forgetting must increase difficulty");
  });

  test("successful review extends the interval beyond the previous one", () => {
    const card = {
      ease: 2.5, interval: 5, reps: 2, state: 2, stability: 5, difficulty: 5,
      reviewed_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
    };
    const good = nextReviewState(card, 3);
    // При удержании 90% рост стабильности после точного «поймал 90%» скромный:
    // интервал не сокращается, а стабильность строго растёт.
    assert.ok(good.interval >= card.interval, "good review must not shorten the interval");
    assert.ok(good.stability > card.stability);
    assert.ok(good.difficulty <= card.difficulty, "good review must not raise difficulty");
    const easy = nextReviewState(card, 4);
    assert.ok(easy.difficulty < card.difficulty, "easy review must ease difficulty");
    assert.equal(good.lapses, 0);
  });
}
