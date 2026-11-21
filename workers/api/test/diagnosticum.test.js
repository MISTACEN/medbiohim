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
  const model = await read(MODEL);
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

test("реестр эндпоинтов и страница диагностикума на месте", async () => {
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

  await access(path.join(ROOT, "src/app/trainers/diagnosticum/page.tsx"));
  const page = await read("src/app/trainers/diagnosticum/page.tsx");
  assert.ok(page.includes("DiagnosticumRunner"));
});
