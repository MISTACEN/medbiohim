/**
 * Диагностикум: контракт API, защита ключа ответа и миграция попыток.
 *
 * Тесты читают исходники, а не поднимают Supabase: они фиксируют решения,
 * которые легко потерять при рефакторинге (порядок подсказок, отсутствие
 * ключа ответа в ответе API, RLS на чужие попытки).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

const ROUTE = "workers/api/src/routes/diagnosticum/index.ts";
const SESSION = "workers/api/src/routes/diagnosticum/session.ts";
const MODEL = "workers/api/src/routes/diagnosticum/model.ts";
const MIGRATION = "database/migrations/20261120_diagnosticum.sql";

test("диагностикум: маршруты режимов, подсказок, ответа и статистики", async () => {
  const source = await read(ROUTE);
  for (const marker of [
    'diagnosticum.get("/", requireAuth',
    'diagnosticum.post("/start", requireAuth',
    'diagnosticum.route("/", session)',
  ]) {
    assert.ok(source.includes(marker), `нет маршрута: ${marker}`);
  }

  const sessionSource = await read(SESSION);
  for (const marker of [
    'session.post("/hint", requireAuth',
    'session.post("/answer", requireAuth',
    'session.get("/stats", requireAuth',
    'session.get("/mistakes", requireAuth',
  ]) {
    assert.ok(sessionSource.includes(marker), `нет маршрута: ${marker}`);
  }
  assert.ok(source.includes("requireAuth") && sessionSource.includes("requireAuth"), "все маршруты должны требовать вход");
});

test("диагностикум: ключ ответа хранится в попытке и не уходит в ответ старта", async () => {
  const source = await read(ROUTE);
  assert.ok(source.includes("answers: built.answers"), "ключ ответа должен сохраняться");
  assert.ok(source.includes("question: built.question"), "клиент получает сам вопрос");

  // Обработчик старта заканчивается там, где монтируется модуль попытки.
  const start = source.slice(
    source.indexOf('diagnosticum.post("/start"'),
    source.indexOf('diagnosticum.route("/"'),
  );
  const response = start.slice(start.lastIndexOf("return c.json("));
  assert.ok(response.includes("question: built.question"));
  assert.ok(!/answers\s*:/.test(response), "ответ старта не должен содержать ключ ответа");
});

test("диагностикум: подсказки выдаются только по порядку и считаются", async () => {
  const source = await read(SESSION);
  assert.ok(source.includes("const nextLevel = Math.max(0, ...used) + 1"), "нужен порядок уровней");
  assert.ok(source.includes("if (requested > nextLevel)"), "нельзя перескочить уровень");
  assert.ok(source.includes("hints_used: levels.length"), "использованные подсказки сохраняются");
  assert.ok(source.includes("hintFor(guide, requested, structureTitles)"));
});

test("модель: четыре режима, штраф за подсказки и разбор ошибок", async () => {
  // Типы вопроса и разбора вынесены в соседний types.ts: читаем оба файла.
  const model = (await Promise.all([read(MODEL), read("workers/api/src/routes/diagnosticum/types.ts")])).join("\n");
  for (const mode of ["identify", "structures", "differential", "complex", "schema"]) {
    assert.ok(model.includes(`"${mode}"`), `нет режима ${mode}`);
  }
  assert.ok(model.includes("export const MAX_HINTS = 4"));
  assert.ok(model.includes("export const HINT_PENALTY = 10"));
  assert.ok(model.includes("missing"), "разбор должен показывать недобор");
  assert.ok(model.includes("extra"), "разбор должен показывать лишние варианты");
});

test("миграция: RLS на свои попытки и скрытый ключ ответа", async () => {
  const sql = await read(MIGRATION);
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("using (user_id = auth.uid())"));
  // Ключ ответа не выдаётся никому из клиентских ролей: revoke покрывает и anon,
  // и authenticated (дефолтные гранты Supabase иначе оставляли бы anon SELECT).
  assert.ok(
    sql.includes("revoke all on public.diagnosticum_attempts from anon, authenticated"),
    "revoke должен закрывать anon и authenticated",
  );

  const grant = sql.match(/grant select \(([\s\S]*?)\) on public\.diagnosticum_attempts/);
  assert.ok(grant, "нужен колоночный grant select");
  assert.ok(!/\banswers\b/.test(grant[1]), "колонка answers не должна выдаваться клиенту");

  assert.ok(
    sql.includes("check (mode in ('identify', 'structures', 'differential', 'complex', 'schema'))"),
    "режим «схема» должен быть разрешён в БД",
  );
});

test("очередь повторения отдаёт уникальные карточки неверных попыток", async () => {
  const source = await read(SESSION);
  const route = source.slice(source.indexOf('session.get("/mistakes"'));
  assert.ok(route.includes('.eq("correct", false)'), "берём только неверные попытки");
  assert.ok(route.includes('.not("card_id", "is", null)'), "без карточки повторять нечего");
  assert.ok(route.includes("seen.has(cardId)"), "одна карточка — одна строка");
  assert.ok(route.includes("items.length >= 20"), "очередь ограничена");
  assert.ok(
    route.includes('ok({ items, total: items.length, migrated: false }') ||
      route.includes("migrated: false"),
    "до миграции пустая очередь, а не 503",
  );
});

test("подсказка и ответ читают попытку service-клиентом с проверкой владельца", async () => {
  // Колонка `answers` не входит в гранты authenticated: loadAttempt на
  // user-клиенте давал permission denied на колонке и маскировал его в
  // NOT_FOUND — падало только на живой БД (прод-баг 2026-11-21).
  const source = await read(SESSION);
  assert.ok(
    source.includes("loadAttempt(service, attemptId, c.get(\"user\").id)"),
    "hint/answer должны читать попытку service-клиентом с user_id",
  );
  const hintBlock = source.slice(source.indexOf('session.post("/hint"'), source.indexOf('session.post("/answer"'));
  const answerBlock = source.slice(source.indexOf('session.post("/answer"'));
  for (const block of [hintBlock, answerBlock]) {
    assert.ok(block.includes("createServiceClient(c.env)"), "service-клиент для ключа ответа");
    assert.ok(!block.includes("loadAttempt(c.get(\"supabase\")"), "user-клиент не читает ключ");
  }
  const shared = await read("workers/api/src/routes/diagnosticum/shared.ts");
  assert.ok(shared.includes('.eq("user_id", userId)'), "владелец попытки проверяется явно (эквивалент RLS)");
});

test("ответ разбирает ключ той же формы, что строит /start", async () => {
  // answers в БД — готовый AnswerKey ({parts}); двойная обёртка ломала /answer
  // с INTERNAL на живой БД (прод-баг 2026-11-21).
  const source = await read(SESSION);
  assert.ok(
    source.includes("const answerKey ="),
    "ключ берётся из попытки без повторной обёртки",
  );
  assert.ok(
    !source.includes("gradeAnswer(\n    { parts: attempt.answers || {} }"),
    "двойная обёртка { parts: attempt.answers } запрещена",
  );
});

test("реестр эндпоинтов и разбор препарата внутри тренажёра", async () => {
  const endpoints = await read("src/lib/endpoints.ts");
  for (const route of [
    'root: (): string => "/diagnosticum"',
    'start: (): string => "/diagnosticum/start"',
    'hint: (): string => "/diagnosticum/hint"',
    'answer: (): string => "/diagnosticum/answer"',
    'stats: (): string => "/diagnosticum/stats"',
    'mistakes: (): string => "/diagnosticum/mistakes"',
  ]) {
    assert.ok(endpoints.includes(route), `нет пути: ${route}`);
  }

  // Отдельной страницы больше нет: диагностикум — формат задания тренажёра,
  // а старый адрес только уводит туда.
  await access(path.join(ROOT, "src/app/trainers/diagnosticum/page.tsx"));
  const page = await read("src/app/trainers/diagnosticum/page.tsx");
  assert.ok(page.includes("redirect("), "старый адрес должен редиректить в тренажёр");
  assert.ok(!page.includes("DiagnosticumRunner"), "свой рендер диагностикума на редиректе не нужен");

  const trainer = await read("src/components/trainers/HistologyTrainer.tsx");
  // Форматы задания вынесены из компонента в histologyFormat.ts.
  const formats = await read("src/components/trainers/histologyFormat.ts");
  assert.ok(trainer.includes("<DiagnosticumRunner"), "разбор препарата рендерится в тренажёре");
  assert.ok(
    formats.includes('{ id: "complex", label: "Разбор препарата" }'),
    "в форматах есть объединённый разбор препарата",
  );
});

test("диагностикум: ЭМ отделены от препаратов, экзамен без подсказок и разбора", async () => {
  const model = await read(MODEL);
  assert.ok(model.includes('bank: "preparation" | "electronogram"'), "банк должен передаваться в выбор карточки");
  assert.ok(model.includes('card.mode_set !== "electronogram"'), "препараты не должны брать ЭМ-карточки");
  assert.ok(model.includes('| "exam"'), "экзамен есть в типах режимов");

  const session = await read(SESSION);
  assert.ok(session.includes('attempt.mode === "exam"'), "экзамен проверяется на сервере");
  assert.ok(session.includes("В экзамене подсказки недоступны"), "подсказки в экзамене запрещены");
  assert.ok(session.includes("exam: true"), "ответ экзамена не отдаёт разбор");

  const runner = await read("src/components/trainers/DiagnosticumRunner.tsx");
  assert.ok(runner.includes("EXAM_TOTAL"), "экзамен идёт серией вопросов");
  assert.ok(runner.includes("Экзамен завершён"), "серия заканчивается итогом");
});
