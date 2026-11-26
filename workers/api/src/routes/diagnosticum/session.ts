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
  type DiagnosticumMode,
  type GuideRow,
  type Submitted,
} from "./model";
import { gradeAnswer, hintFor } from "./grading";
import {
  MODE_LABELS,
  UUID_PATTERN,
  isMissingTable,
  loadAttempt,
  loadStructureTitles,
  type AttemptRow,
  type SupabaseError,
} from "./shared";

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
  const update = await c
    .get("supabase")
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
    | { attempt_id?: unknown; submitted?: unknown }
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
  const result = gradeAnswer(answerKey, submitted, Number(attempt.hints_used || 0));
  const feedback = { parts: result.parts, guide_key: attempt.guide_key };

  const update = await c
    .get("supabase")
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
      },
      rid,
    ),
  );
});

type StatsRow = {
  mode: string;
  section: string | null;
  guide_key: string;
  correct: boolean | null;
  score: number | null;
  hints_used: number | null;
};

/** GET /diagnosticum/stats — сводка по своим попыткам и слабые разделы. */
session.get("/stats", requireAuth, async (c) => {
  const rid = requestId();
  const { data, error } = await c
    .get("supabase")
    .from("diagnosticum_attempts")
    .select("mode,section,guide_key,correct,score,hints_used")
    .not("answered_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    if (isMissingTable(error as SupabaseError)) {
      return c.json(ok({ migrated: false, answered: 0 }, rid));
    }
    console.error("[diagnosticum:stats]", error.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Статистика недоступна", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const rows = (data || []) as StatsRow[];
  const answered = rows.length;
  const correct = rows.filter((row) => row.correct).length;
  const hints = rows.reduce((sum, row) => sum + Number(row.hints_used || 0), 0);
  const avgScore = answered
    ? Math.round(rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / answered)
    : 0;

  const bySection = new Map<string, { section: string; total: number; correct: number }>();
  const byMode = new Map<string, { mode: string; total: number; correct: number }>();
  for (const row of rows) {
    const section = String(row.section || "Без раздела");
    const sectionEntry = bySection.get(section) ?? { section, total: 0, correct: 0 };
    sectionEntry.total += 1;
    if (row.correct) sectionEntry.correct += 1;
    bySection.set(section, sectionEntry);

    const modeEntry = byMode.get(row.mode) ?? { mode: row.mode, total: 0, correct: 0 };
    modeEntry.total += 1;
    if (row.correct) modeEntry.correct += 1;
    byMode.set(row.mode, modeEntry);
  }

  const withRate = <T extends { total: number; correct: number }>(entry: T) => ({
    ...entry,
    correct_rate: Math.round((entry.correct / entry.total) * 100),
  });

  const sections = Array.from(bySection.values()).map(withRate);
  const weakSections = [...sections]
    .filter((entry) => entry.total >= 2)
    .sort((a, b) => a.correct_rate - b.correct_rate)
    .slice(0, 3)
    .map((entry) => entry.section);

  return c.json(
    ok(
      {
        migrated: true,
        answered,
        correct,
        correct_rate: answered ? Math.round((correct / answered) * 100) : 0,
        avg_score: avgScore,
        hints,
        by_mode: Array.from(byMode.values()).map((entry) => ({
          ...withRate(entry),
          title: MODE_LABELS[entry.mode as DiagnosticumMode] || entry.mode,
        })),
        by_section: sections,
        weak_sections: weakSections,
      },
      rid,
    ),
  );
});

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
