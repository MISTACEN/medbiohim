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

// Интерфейс диагностикума разнесён по компонентам (бюджет 600 строк на файл),
// поэтому текстовые проверки читают UI целиком, а не только файл-родитель.
const UI_FILES = [
  "src/components/trainers/DiagnosticumRunner.tsx",
  "src/components/trainers/DiagnosticumModeChips.tsx",
  "src/components/trainers/DiagnosticumPartsList.tsx",
  "src/components/trainers/DiagnosticumResultPanel.tsx",
  "src/components/trainers/DiagnosticumExamPanel.tsx",
  "src/components/trainers/HistologyTrainer.tsx",
  "src/components/trainers/HistologyTrainerFilters.tsx",
];
const readUi = async () => (await Promise.all(UI_FILES.map((file) => read(file)))).join("\n");

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
  assert.ok(trainer.includes("<DiagnosticumRunner"), "разбор препарата рендерится в тренажёре");
  // Форматы «Карточки препаратов / Разбор препарата» объединены: один экран без
  // переключателя форматов, поэтому в разметке его быть не должно.
  assert.ok(!trainer.includes("Формат заданий"), "переключатель форматов убран");
  assert.ok(trainer.includes("Практика по препаратам"), "диагностикум и карточки — один блок практики");
  const formats = await read("src/components/trainers/histologyFormat.ts");
  assert.ok(!formats.includes("TRAINING_FORMATS"), "в модуле не осталось списка форматов");
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
  assert.ok(runner.includes("total: examLength"), "экзамен идёт серией вопросов настраиваемой длины");
  assert.ok(runner.includes("setTimeLeft(examTime)"), "у каждого вопроса серии свой таймер");
  const ui = await readUi();
  assert.ok(ui.includes("Экзамен завершён"), "серия заканчивается итогом");
});

test("диагностикум: электронограммы идут отдельным режимом по карточкам банка", async () => {
  const model = await read(MODEL);
  assert.ok(model.includes("buildElectronogramQuestion"), "есть отдельный построитель ЭМ-вопроса");
  assert.ok(model.includes('card.mode_set !== "electronogram" || !card.id'), "в банк ЭМ попадают только ЭМ-карточки с картинкой");
  assert.ok(model.includes("em:${"), "попытки ЭМ помечены префиксом");

  const route = await read(ROUTE);
  assert.ok(route.includes('body.mode === "electronogram"'), "старт ЭМ не зависит от раздела препаратов");
  assert.ok(route.includes("buildElectronogramQuestion(bank.cards)"), "вопрос ЭМ строится по карточкам");

  const session = await read(SESSION);
  assert.ok(session.includes("Для электронограмм подсказок нет"), "у ЭМ нет подсказок");
  assert.ok(session.includes('attempt.mode === "electronogram" ? "" : attempt.guide_key'), "ЭМ не отдаёт ключ методички");
});

test("диагностикум: режимы экзамена и ЭМ доступны из интерфейса тренажёра", async () => {
  const trainer = await read("src/components/trainers/HistologyTrainer.tsx");
  // Режимы выбираются в общем блоке практики, раннер получает уже выбранный.
  assert.ok(trainer.includes("const PRACTICE_MODES"), "режимы практики объявлены списком");
  for (const mode of ['id: "exam"', 'id: "electronogram"', 'id: "complex"', 'id: "cards"', 'id: "atlas"']) {
    assert.ok(trainer.includes(mode), `в режимах практики нет ${mode}`);
  }
  assert.ok(
    /<DiagnosticumRunner[\s\S]{0,200}?mode=\{practice\}/.test(trainer),
    "раннер получает выбранный режим",
  );
  assert.ok(
    trainer.includes("cardIds={selectedCardIds.slice(0, 30)}"),
    "выбранные карточки передаются в серию",
  );

  const ui = await readUi();
  assert.ok(ui.includes('STUDENT_MODES: DiagnosticumMode[] = ["complex", "exam", "electronogram"]'));
  assert.ok(ui.includes("STUDENT_MODES.includes(item.mode)"), "в переключателе только студенческие режимы");
});

test("диагностикум: миграция режимов разрешает exam и electronogram", async () => {
  const migration = await read("database/migrations/20261126_diagnosticum_modes.sql");
  for (const mode of ["'exam'", "'electronogram'", "'complex'", "'schema'"]) {
    assert.ok(migration.includes(mode), `в ограничении режимов нет ${mode}`);
  }
  assert.ok(migration.includes("drop constraint if exists diagnosticum_attempts_mode_check"), "миграция идемпотентна");
  assert.ok(migration.includes("add constraint diagnosticum_attempts_mode_check"), "ограничение пересоздаётся");

  const shared = await read("workers/api/src/routes/diagnosticum/shared.ts");
  assert.ok(shared.includes("isConstraintViolation"), "ошибка ограничения режимов распознаётся");
  const route = await read(ROUTE);
  assert.ok(
    route.includes("Новый режим ещё не включён: нужна миграция режимов диагностикума"),
    "503 объясняет неприменённую миграцию, а не «БД недоступна»",
  );
});

test("диагностикум: переключатель режимов реально меняет режим", async () => {
  const runner = await read("src/components/trainers/DiagnosticumRunner.tsx");
  assert.ok(
    runner.includes('useState<DiagnosticumMode>(controlledMode ?? "complex")'),
    "внешний режим — только стартовое значение",
  );
  assert.ok(!runner.includes("controlledMode ?? localMode"), "внешний режим не должен перекрывать выбор в чипах");
});

test("диагностикум: у электронограмм в UI нет кнопки подсказки", async () => {
  // Кнопки ответа и подсказки вынесены в отдельный компонент.
  const actions = await read("src/components/trainers/DiagnosticumAnswerActions.tsx");
  assert.ok(actions.includes('mode === "exam" || mode === "electronogram"'), "подсказки скрыты и в ЭМ, и в экзамене");
  assert.ok(actions.includes("Для электронограмм подсказок нет"), "в ЭМ объяснено, почему нет подсказок");
});

test("диагностикум: без ключа методички нет кнопки «Методика поиска»", async () => {
  const ui = await readUi();
  assert.ok(ui.includes("result.guide_key ?"), "кнопка методички рендерится только при наличии гида");
});

test("тренажёр: кнопки старта не дублируют друг друга", async () => {
  const ui = await readUi();
  assert.ok(ui.includes("Начать тренировку"), "своя тренировка названа явно");
  const toolbar = await read("src/components/trainers/DiagnosticumToolbar.tsx");
  assert.ok(toolbar.includes("Начать разбор") && toolbar.includes("Начать экзамен"), "режим диагностикума виден на кнопке");
});

test("набор первой диагностики: 19 позиций и честный пропуск", async () => {
  const sets = await read("workers/api/src/routes/diagnosticum/sets.ts");
  const items = sets.match(/\{ exam: "[^"]+", key: "[^"]+" \}/g) || [];
  assert.equal(items.length, 19, "в наборе должно остаться 19 позиций концепции");
  assert.ok(sets.includes("embryology-axial-organs"), "позиция без методички не удаляется из списка");
  assert.ok(sets.includes("missing.push"), "позиция без методички попадает в missing");

  const route = await read(ROUTE);
  assert.ok(route.includes("setGuides(FIRST_DIAGNOSTICUM"), "старт фильтрует пул по набору");
  assert.ok(
    route.includes("setRequested ? FIRST_DIAGNOSTICUM.title"),
    "попытка набора сохраняет имя набора для статистики",
  );
  assert.ok(
    route.includes("isSetSection(FIRST_DIAGNOSTICUM, entry.section)"),
    "набор не дублируется как обычный раздел",
  );
});

test("экзамен: серия переживает перезагрузку страницы", async () => {
  const session = await read(SESSION);
  assert.ok(session.includes('session.get("/attempt/:id", requireAuth'), "есть чтение задания попытки");
  const block = session.slice(
    session.indexOf('session.get("/attempt/:id"'),
    session.indexOf('session.get("/stats"'),
  );
  assert.ok(!/answers\s*:/.test(block), "ключ ответа не возвращается вместе с заданием");
  assert.ok(block.includes("answered: Boolean(attempt.answered_at)"), "клиент знает, отвечено ли задание");

  const api = await read("src/lib/diagnosticum-api.ts");
  assert.ok(api.includes("getDiagnosticumAttempt"), "у клиента есть восстановление попытки");

  const runner = await read("src/components/trainers/DiagnosticumRunner.tsx");
  assert.ok(runner.includes("EXAM_STORAGE_KEY"), "серия хранится в sessionStorage");
  assert.ok(runner.includes("getDiagnosticumAttempt(attemptId)"), "задание восстанавливается с сервера");
  assert.ok(runner.includes("res.data.answered"), "отвеченное задание не переигрывается");
});
