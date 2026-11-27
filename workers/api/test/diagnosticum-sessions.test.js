import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("серии диагностикума: аддитивная миграция со связью попыток и RLS", async () => {
  const sql = await source("../../../database/migrations/20261127_diagnosticum_sessions.sql");
  assert.match(sql, /create table if not exists public\.diagnosticum_sessions/i);
  assert.match(sql, /add column if not exists session_id uuid references public\.diagnosticum_sessions/i);
  assert.match(sql, /add column if not exists session_index integer/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /using \(user_id = auth\.uid\(\)\)/i);
  // Запись в сессию — только сервер: у пользователя остаётся чтение.
  assert.match(sql, /revoke insert, update, delete on public\.diagnosticum_sessions from authenticated/i);
  assert.match(sql, /grant select on public\.diagnosticum_sessions to authenticated/i);
  assert.doesNotMatch(sql, /(^|\n)\s*delete\s+from/i);
  assert.doesNotMatch(sql, /(^|\n)\s*drop\s+table/i);
});

test("серии: старт, восстановление и идемпотентный итог без утечки ключа", async () => {
  const route = await source("../src/routes/diagnosticum/sessions.ts");
  assert.match(route, /sessions\.post\("\/sessions"/);
  assert.match(route, /sessions\.get\("\/sessions\/:id"/);
  assert.match(route, /sessions\.post\("\/sessions\/:id\/finish"/);
  // В выдаче серии нет ключа: только вопрос и признак ответа.
  assert.match(route, /question: item\.question,\n\s*answered: false,/);
  // Повторный finish возвращает тот же итог.
  assert.match(route, /alreadyFinished/);
  // Неотвеченные вопросы считаются нулём, а не выпадают из среднего.
  assert.match(route, /answered\.reduce\(\(sum, row\) => sum \+ Number\(row\.score \?\? 0\), 0\) \/ total/);

  const model = await source("../src/routes/diagnosticum/sessions-model.ts");
  assert.match(model, /export function buildSeries/);
  assert.match(model, /used\.has\(guide\.key\)/);
  assert.match(model, /if \(String\(found\.data\.user_id\) !== userId\) return \{ error: "NOT_FOUND"/);
});

test("приёмка DIA: полная подсказка, без дублей вариантов, статистика по режимам", async () => {
  const grading = await source("../src/routes/diagnosticum/grading.ts");
  // Подсказка 2 перечисляет все структуры препарата, а не три из четырёх.
  assert.match(grading, /const labels = guideStructures\(guide\)\.map\(title\)/);
  assert.doesNotMatch(grading, /guideStructures\(guide\)\.slice\(/);

  const model = await source("../src/routes/diagnosticum/model-questions.ts");
  // Обманки уникальны по названию и не дублируют сам препарат.
  assert.match(model, /const seen = new Set<string>\(\[guide\.name\.trim\(\)\]\)/);
  assert.match(model, /if \(!name \|\| seen\.has\(name\)\) return false/);

  const stats = await source("../../../src/components/trainers/DiagnosticumStats.tsx");
  assert.match(stats, /stats\.by_mode\.map/);
});

test("«своя серия»: выбранные карточки без подмены, дублей и чужих препаратов", async () => {
  const model = await source("../src/routes/diagnosticum/sessions-model.ts");
  assert.match(model, /export function buildCardSeries/);
  // Нерешаемая карточка не заменяется другой, а попадает в missing.
  assert.match(model, /missing\.push\(id\)/);
  assert.match(model, /if \(seen\.has\(id\)\) continue;/);

  const route = await source("../src/routes/diagnosticum/sessions.ts");
  assert.match(route, /requestedCards\.length\s*\n?\s*\? buildCardSeries/);
  assert.match(route, /CARD_SELECTION_UNAVAILABLE/);
  assert.match(route, /const effectiveSection = requestedCards\.length \? "Своя серия"/);

  // Конкретная карточка задаёт изображение вопроса, а не подбор по названию.
  const build = await source("../src/routes/diagnosticum/model.ts");
  assert.match(build, /card\?: CardRow/);
  assert.match(build, /input\.card \?\? pickImageCard/);
});

test("UI: серия по выбранным карточкам из «своей серии»", async () => {
  const runner = await source("../../../src/components/trainers/DiagnosticumRunner.tsx");
  assert.match(runner, /cardIds\?: string\[\]/);
  assert.match(runner, /card_ids: cardIds\?\.length \? cardIds : undefined/);

  const trainer = await source("../../../src/components/trainers/HistologyTrainer.tsx");
  assert.match(trainer, /cardIds=\{selectedCardIds\.slice\(0, 30\)\}/);
  assert.match(trainer, /onExamSelected=\{/);

  const filters = await source("../../../src/components/trainers/HistologyTrainerFilters.tsx");
  assert.match(filters, /onExamSelected/);
  assert.match(filters, /Экзамен по выбранным \(\$?\{?/);
});

test("серии смонтированы в диагностикум и доступны клиенту", async () => {
  const index = await source("../src/routes/diagnosticum/index.ts");
  assert.match(index, /import sessions from "\.\/sessions"/);
  assert.match(index, /diagnosticum\.route\("\/", sessions\)/);

  const api = await source("../../../src/lib/diagnosticum-api.ts");
  assert.match(api, /export function startDiagnosticumSession/);
  assert.match(api, /export function getDiagnosticumSession/);
  assert.match(api, /export function finishDiagnosticumSession/);

  const runner = await source("../../../src/components/trainers/DiagnosticumRunner.tsx");
  assert.match(runner, /startDiagnosticumSession\(/);
  assert.match(runner, /finishDiagnosticumSession\(/);
  assert.match(runner, /getDiagnosticumSession\(savedSessionId\)/);

  const panel = await source("../../../src/components/trainers/DiagnosticumExamPanel.tsx");
  assert.match(panel, /Разбор серии/);
  assert.match(panel, /review\?\.|review\.items/);
});
