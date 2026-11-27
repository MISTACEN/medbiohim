/**
 * Ход попытки: подсказки, проверка ответа и личная статистика.
 *
 * Монтируется в `index.ts` на корень `/diagnosticum`, поэтому пути остаются
 * прежними (`/diagnosticum/hint` и т.д.).
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import type { Env } from "../../env";
import {
  MAX_HINTS,
  stringList,
  type GuideRow,
  type Submitted,
} from "./model";
import { gradeAnswer, hintFor } from "./grading";
import { judgeTextAnswers, type TextOutcome } from "./text-answers";
import {
  UUID_PATTERN,
  isMissingTable,
  loadAttempt,
  loadStructureTitles,
  type SupabaseError,
} from "./shared";
import { stats } from "./session-stats";

const session = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** POST /diagnosticum/hint — следующая подсказка (только по порядку). */
session.post("/hint", requireAuth, async (c) => {
  const rid = requestId();
  const body = (await c.req.json().catch(() => null)) as
    | { attempt_id?: unknown; level?: unknown }
    | null;
  const attemptId = String(body?.attempt_id ?? "");
  if (!UUID_PATTERN.test(attemptId)) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Некорректная попытка", 422, rid);
    return c.json(errorBody, status as 422);
  }

  // Колонка `answers` не входит в гранты authenticated — попытку с ключом читает
  // service-клиент, владение проверяется явным user_id (эквивалент RLS).
  const service = createServiceClient(c.env);
  if (!service) {
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Сервис данных недоступен", 503, rid);
    return c.json(errorBody, status as 503);
  }
  const loaded = await loadAttempt(service, attemptId, c.get("user").id);
  if ("error" in loaded) {
    const notFound = loaded.error === "NOT_FOUND";
    const { body: errorBody, status } = fail(
      notFound ? "NOT_FOUND" : "DB_UNAVAILABLE",
      "Попытка не найдена",
      notFound ? 404 : 503,
      rid,
    );
    return c.json(errorBody, status as 404 | 503);
  }

  const attempt = loaded.row;
  if (attempt.answered_at) {
    const { body: errorBody, status } = fail(
      "CONFLICT",
      "Задание уже отвечено — подсказки недоступны",
      409,
      rid,
    );
    return c.json(errorBody, status as 409);
  }

  // В экзамене подсказок нет: это контролируемое определение. У электронограмм
  // нет методички, из которой строятся уровни подсказок, — поэтому тоже нет.
  if (attempt.mode === "exam" || attempt.mode === "electronogram") {
    const { body: errorBody, status } = fail(
      "CONFLICT",
      attempt.mode === "exam"
        ? "В экзамене подсказки недоступны"
        : "Для электронограмм подсказок нет",
      409,
      rid,
    );
    return c.json(errorBody, status as 409);
  }

  const used = stringList(attempt.hints).map(Number).filter((value) => value > 0);
  const requested = Number(body?.level ?? Math.max(0, ...used) + 1);
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_HINTS) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Некорректный уровень подсказки", 422, rid);
    return c.json(errorBody, status as 422);
  }
  // Подсказки выдаются по порядку: нельзя сразу открыть четвёртую.
  const nextLevel = Math.max(0, ...used) + 1;
  if (requested > nextLevel) {
    const { body: errorBody, status } = fail(
      "VALIDATION_ERROR",
      `Сначала подсказка уровня ${nextLevel}`,
      422,
      rid,
    );
    return c.json(errorBody, status as 422);
  }

  const guideQuery = await c
    .get("supabase")
    .from("preparation_guides")
    .select("*")
    .eq("key", attempt.guide_key)
    .maybeSingle();
  const guide = (guideQuery.data || null) as GuideRow | null;
  const structureTitles = await loadStructureTitles(c.get("supabase"));

  const hint = guide ? hintFor(guide, requested, structureTitles) : null;
  if (!hint) {
    const { body: errorBody, status } = fail("NOT_FOUND", "Для этого задания нет подсказки", 404, rid);
    return c.json(errorBody, status as 404);
  }

  const levels = Array.from(new Set([...used, requested])).sort((a, b) => a - b);
  // Запись — только серверным клиентом: грант update у authenticated отозван,
  // иначе студент мог бы сам выставить себе балл в обход проверки.
  const update = await service
    .from("diagnosticum_attempts")
    .update({ hints: levels, hints_used: levels.length })
    .eq("id", attempt.id);
  if (update.error) {
    console.error("[diagnosticum:hint]", update.error.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить подсказку", 503, rid);
    return c.json(errorBody, status as 503);
  }

  return c.json(ok({ level: requested, hint, hints_used: levels.length, hints_total: MAX_HINTS }, rid));
});

/** POST /diagnosticum/answer — проверка ответа и разбор ошибок. */
session.post("/answer", requireAuth, async (c) => {
  const rid = requestId();
  const body = (await c.req.json().catch(() => null)) as
    | { attempt_id?: unknown; submitted?: unknown; submitted_text?: unknown }
    | null;
  const attemptId = String(body?.attempt_id ?? "");
  if (!UUID_PATTERN.test(attemptId)) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Некорректная попытка", 422, rid);
    return c.json(errorBody, status as 422);
  }

  const submittedRaw = body?.submitted;
  if (!submittedRaw || typeof submittedRaw !== "object" || Array.isArray(submittedRaw)) {
    const { body: errorBody, status } = fail(
      "VALIDATION_ERROR",
      "Нужен объект с выбранными вариантами по частям задания",
      422,
      rid,
    );
    return c.json(errorBody, status as 422);
  }
  const submitted: Submitted = {};
  for (const [partId, value] of Object.entries(submittedRaw as Record<string, unknown>)) {
    submitted[partId] = stringList(value);
  }

  // Свободный ввод: части, отвеченные словами, приходят отдельным объектом.
  // Ограничение длины — чтобы в строку попытки не улетал абзац текста.
  const submittedText: Record<string, string> = {};
  const textRaw = body?.submitted_text;
  if (textRaw && typeof textRaw === "object" && !Array.isArray(textRaw)) {
    for (const [partId, value] of Object.entries(textRaw as Record<string, unknown>)) {
      const clean = String(value ?? "").slice(0, 300).trim();
      if (clean) submittedText[partId] = clean;
    }
  }

  // Service-клиент: ключ ответа не входит в колоночные гранты authenticated.
  const service = createServiceClient(c.env);
  if (!service) {
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Сервис данных недоступен", 503, rid);
    return c.json(errorBody, status as 503);
  }
  const loaded = await loadAttempt(service, attemptId, c.get("user").id);
  if ("error" in loaded) {
    const notFound = loaded.error === "NOT_FOUND";
    const { body: errorBody, status } = fail(
      notFound ? "NOT_FOUND" : "DB_UNAVAILABLE",
      "Попытка не найдена",
      notFound ? 404 : 503,
      rid,
    );
    return c.json(errorBody, status as 404 | 503);
  }

  const attempt = loaded.row;
  if (attempt.answered_at) {
    const { body: errorBody, status } = fail("CONFLICT", "Задание уже отвечено", 409, rid);
    return c.json(errorBody, status as 409);
  }

  // В колонке answers лежит готовый AnswerKey ({parts: {...}}) — тот же объект,
  // что строит buildQuestion (см. /start). Раньше его оборачивали в {parts}
  // второй раз: key.correct был undefined и /answer падал INTERNAL на живой БД.
  const answerKey = attempt.answers && typeof attempt.answers === "object" ? attempt.answers : { parts: {} };
  // Текстовые части проверяются отдельно: правила, затем один запрос к ИИ.
  const text = Object.keys(submittedText).length
    ? await judgeTextAnswers({
        question: attempt.question,
        answers: answerKey,
        submittedText,
        env: c.env,
      })
    : { verdicts: {} as Record<string, boolean>, outcomes: {} as Record<string, TextOutcome> };
  const result = gradeAnswer(answerKey, submitted, Number(attempt.hints_used || 0), text.verdicts);
  const feedback = {
    parts: result.parts,
    guide_key: attempt.guide_key,
    ...(Object.keys(text.outcomes).length ? { text: text.outcomes } : {}),
  };

  const update = await service
    .from("diagnosticum_attempts")
    .update({
      correct: result.correct,
      score: result.score,
      feedback,
      answered_at: new Date().toISOString(),
    })
    .eq("id", attempt.id);
  if (update.error) {
    console.error("[diagnosticum:answer]", update.error.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(errorBody, status as 503);
  }

  // Экзамен: до завершения серии не показываем ни разбор, ни название препарата —
  // только балл. Иначе эталон утекает в браузер после первого ответа.
  if (attempt.mode === "exam") {
    return c.json(
      ok(
        {
          correct: result.correct,
          score: result.score,
          hints_used: 0,
          exam: true,
        },
        rid,
      ),
    );
  }

  return c.json(
    ok(
      {
        correct: result.correct,
        score: result.score,
        hints_used: Number(attempt.hints_used || 0),
        parts: result.parts,
        // У электронограммы нет методички — пустой ключ, чтобы клиент не звал панель.
        guide_key: attempt.mode === "electronogram" ? "" : attempt.guide_key,
        section: attempt.section || "",
        // Как проверяли свободный ввод: точное совпадение, правило или ИИ.
        ...(Object.keys(text.outcomes).length ? { text: text.outcomes } : {}),
      },
      rid,
    ),
  );
});

/**
 * GET /diagnosticum/attempt/:id — текущее задание попытки без ключа ответа.
 *
 * Нужно экзаменационной серии: после перезагрузки страницы клиент находит
 * сохранённую попытку и продолжает с того же вопроса. Строка попытки читается
 * service-клиентом (в ней `answers`), но в ответ уходит только `question`.
 */
session.get("/attempt/:id", requireAuth, async (c) => {
  const rid = requestId();
  const attemptId = String(c.req.param("id") || "");
  if (!UUID_PATTERN.test(attemptId)) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Некорректная попытка", 422, rid);
    return c.json(errorBody, status as 422);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Сервис данных недоступен", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const loaded = await loadAttempt(service, attemptId, c.get("user").id);
  if ("error" in loaded) {
    const notFound = loaded.error === "NOT_FOUND";
    const { body: errorBody, status } = fail(
      notFound ? "NOT_FOUND" : "DB_UNAVAILABLE",
      "Попытка не найдена",
      notFound ? 404 : 503,
      rid,
    );
    return c.json(errorBody, status as 404 | 503);
  }

  const attempt = loaded.row;
  return c.json(
    ok(
      {
        attempt_id: attempt.id,
        mode: attempt.mode,
        section: String(attempt.section || ""),
        question: attempt.question,
        hints_total: MAX_HINTS,
        hints_used: Number(attempt.hints_used || 0),
        answered: Boolean(attempt.answered_at),
      },
      rid,
    ),
  );
});

/** GET /diagnosticum/stats — сводка по своим попыткам и слабые разделы. */
session.get("/stats", requireAuth, stats);

type MistakeRow = {
  card_id: string | null;
  guide_key: string;
  section: string | null;
  score: number | null;
  created_at: string;
};

/**
 * GET /diagnosticum/mistakes — очередь повторения.
 *
 * Ошибка диагностикума — это конкретная карточка банка (`card_id`), поэтому
 * очередь отдаётся как список id для deep-link `?cards=` существующего
 * тренажёра: отдельного «второго» режима повторения не заводим.
 */
session.get("/mistakes", requireAuth, async (c) => {
  const rid = requestId();
  const { data, error } = await c
    .get("supabase")
    .from("diagnosticum_attempts")
    .select("card_id,guide_key,section,score,created_at")
    .eq("correct", false)
    // Электронограммы к методичкам не привязаны: в серию по `card_ids` они не
    // попадают (`buildCardSeries` их отбрасывает), поэтому и в очередь повтора
    // им нельзя — иначе «Повторить ошибки» вёл в тупик.
    .neq("mode", "electronogram")
    .not("card_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    if (isMissingTable(error as SupabaseError)) {
      return c.json(ok({ items: [], total: 0, migrated: false }, rid));
    }
    console.error("[diagnosticum:mistakes]", error.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Очередь повторения недоступна", 503, rid);
    return c.json(errorBody, status as 503);
  }

  // Одна карточка — одна строка, даже если ошибок по ней было несколько.
  const seen = new Set<string>();
  const items: {
    card_id: string;
    guide_key: string;
    section: string;
    score: number | null;
    created_at: string;
  }[] = [];
  for (const row of (data || []) as MistakeRow[]) {
    const cardId = String(row.card_id || "");
    if (!cardId || seen.has(cardId)) continue;
    seen.add(cardId);
    items.push({
      card_id: cardId,
      guide_key: row.guide_key,
      section: String(row.section || ""),
      score: row.score ?? null,
      created_at: row.created_at,
    });
    if (items.length >= 20) break;
  }

  return c.json(ok({ items, total: items.length, migrated: true }, rid));
});

export default session;