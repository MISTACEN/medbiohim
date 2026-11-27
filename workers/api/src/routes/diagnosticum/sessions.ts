/**
 * Серия диагностикума на сервере: старт, восстановление и разбор.
 *
 * Одиночное задание (`/diagnosticum/start`) остаётся прежним и работает без
 * сессии. Серия нужна экзамену и «своей серии»: состав вопросов, порядок и
 * итог хранятся в `diagnosticum_sessions`, поэтому перезагрузка страницы не
 * теряет прогресс, а «пропуски» считаются по факту, а не по последней попытке.
 *
 * Ключ ответа по-прежнему не покидает сервер: в выдаче только `question`,
 * разбор приходит после `finish`.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import type { Env } from "../../env";
import { UUID_PATTERN, isMissingTable, loadBank } from "./shared";
import { MAX_HINTS } from "./model";
import {
  DEFAULT_SESSION_LENGTH,
  MAX_SESSION_LENGTH,
  buildCardSeries,
  buildSeries,
  isMode,
  loadOwnedSession,
  reviewOf,
} from "./sessions-model";

const sessions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** POST /diagnosticum/sessions — собрать серию и сохранить её на сервере. */
sessions.post("/sessions", requireAuth, async (c) => {
  const rid = requestId();
  const body = (await c.req.json().catch(() => null)) as
    | {
        mode?: unknown;
        section?: unknown;
        length?: unknown;
        timer_sec?: unknown;
        /** «Своя серия»: конкретные карточки банка, выбранные студентом. */
        card_ids?: unknown;
      }
    | null;

  if (!isMode(body?.mode)) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Неизвестный режим диагностикума", 422, rid);
    return c.json(errorBody, status as 422);
  }
  const requestedLength = Number(body?.length ?? DEFAULT_SESSION_LENGTH);
  if (!Number.isInteger(requestedLength) || requestedLength < 1 || requestedLength > MAX_SESSION_LENGTH) {
    const { body: errorBody, status } = fail(
      "VALIDATION_ERROR",
      `Длина серии должна быть от 1 до ${MAX_SESSION_LENGTH}`,
      422,
      rid,
    );
    return c.json(errorBody, status as 422);
  }
  const rawTimer = body?.timer_sec;
  const timerSec = rawTimer === null || rawTimer === undefined ? null : Number(rawTimer);
  if (timerSec !== null && (!Number.isInteger(timerSec) || timerSec < 10 || timerSec > 3600)) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Таймер должен быть от 10 до 3600 секунд", 422, rid);
    return c.json(errorBody, status as 422);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Сервис данных недоступен", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const loaded = await loadBank(c.get("supabase"), rid);
  if ("error" in loaded) {
    const notMigrated = loaded.error === "NOT_MIGRATED";
    const { body: errorBody, status } = fail(
      notMigrated ? "NOT_MIGRATED" : "DB_UNAVAILABLE",
      notMigrated
        ? "Диагностикум ещё не подключён: нужна миграция методических карточек"
        : "Диагностикум недоступен",
      503,
      rid,
    );
    return c.json(errorBody, status as 503);
  }

  const section = String(body?.section ?? "").trim();
  const requestedCards = Array.isArray(body?.card_ids)
    ? Array.from(
        new Set(
          body.card_ids
            .map((value) => String(value ?? "").trim())
            .filter(Boolean),
        ),
      )
    : [];
  if (requestedCards.length > MAX_SESSION_LENGTH) {
    const { body: errorBody, status } = fail(
      "VALIDATION_ERROR",
      `В серии может быть не больше ${MAX_SESSION_LENGTH} карточек`,
      422,
      rid,
    );
    return c.json(errorBody, status as 422);
  }

  const built = requestedCards.length
    ? buildCardSeries(loaded.bank, requestedCards, body.mode)
    : { items: buildSeries(loaded.bank, body.mode, section, requestedLength), missing: [] as string[] };
  // Часть выбранных карточек может быть недоступна: электронограмма, снимок без
  // методички, карточка снята с публикации. Серия собирается из остальных, а
  // пропуски отдаются клиенту (`missing`), чтобы он сказал об этом честно.
  // Раньше любой пропуск ронял весь старт в 422 — из-за этого «Повторить
  // ошибки» (там в очереди есть ЭМ) не запускал серию вообще.
  const skipped = built.missing;
  // «Своя серия» — отдельный раздел статистики: иначе выбранные препараты
  // растворялись бы в системах органов.
  const effectiveSection = requestedCards.length ? "Своя серия" : section;
  const items = built.items;
  if (!items.length) {
    const { body: errorBody, status } = fail(
      "NOT_FOUND",
      requestedCards.length
        ? "Выбранные карточки недоступны для разбора: нужны снимок и методичка"
        : "Для серии не хватает препаратов с изображениями",
      404,
      rid,
    );
    return c.json(errorBody, status as 404);
  }

  const user = c.get("user");
  const created = await service
    .from("diagnosticum_sessions")
    .insert({
      user_id: user.id,
      mode: body.mode,
      section: effectiveSection,
      session_length: items.length,
      timer_sec: timerSec,
      total_count: items.length,
    })
    .select("id,created_at")
    .single();

  if (created.error || !created.data) {
    if (isMissingTable(created.error)) {
      const { body: errorBody, status } = fail(
        "NOT_MIGRATED",
        "Сессии диагностикума ещё не подключены: нужна миграция",
        503,
        rid,
      );
      return c.json(errorBody, status as 503);
    }
    console.error("[diagnosticum:sessions:create]", created.error?.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Не удалось начать серию", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const sessionId = String(created.data.id);
  const rows = items.map((item, index) => ({
    user_id: user.id,
    mode: body.mode,
    section: item.section,
    guide_key: item.guideKey,
    card_id: item.question.image_card_id,
    question: item.question,
    answers: item.answers,
    session_id: sessionId,
    session_index: index,
  }));

  const inserted = await service
    .from("diagnosticum_attempts")
    .insert(rows)
    .select("id,session_index");

  if (inserted.error) {
    // Сессия без вопросов — мусор: убираем, чтобы не висела в истории.
    await service.from("diagnosticum_sessions").delete().eq("id", sessionId);
    console.error("[diagnosticum:sessions:attempts]", inserted.error.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить вопросы серии", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const attemptIds = (inserted.data || [])
    .slice()
    .sort((a, b) => Number(a.session_index ?? 0) - Number(b.session_index ?? 0))
    .map((row) => String(row.id));

  await service.from("diagnosticum_sessions").update({ attempt_ids: attemptIds }).eq("id", sessionId);

  return c.json(
    ok(
      {
        session_id: sessionId,
        mode: body.mode,
        section: effectiveSection,
        timer_sec: timerSec,
        status: "in_progress",
        total: items.length,
        created_at: created.data.created_at,
        // Какие выбранные карточки не вошли в серию: клиент показывает это, а не
        // ошибку старта.
        missing: skipped,
        items: items.map((item, index) => ({
          attempt_id: attemptIds[index],
          index,
          section: item.section,
          // `guide_key` в статусе in_progress не отдаём: по нему (как и по id
          // варианта) можно было вычислить правильный ответ до ответа.
          question: item.question,
          answered: false,
          hints_total: MAX_HINTS,
        })),
      },
      rid,
    ),
  );
});

/** GET /diagnosticum/sessions/:id — восстановление серии после перезагрузки. */
sessions.get("/sessions/:id", requireAuth, async (c) => {
  const rid = requestId();
  const sessionId = String(c.req.param("id") || "");
  if (!UUID_PATTERN.test(sessionId)) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Некорректная серия", 422, rid);
    return c.json(errorBody, status as 422);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Сервис данных недоступен", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const loaded = await loadOwnedSession(service, sessionId, c.get("user").id);
  if ("error" in loaded) {
    const notFound = loaded.error === "NOT_FOUND";
    const { body: errorBody, status } = fail(
      notFound ? "NOT_FOUND" : "DB_UNAVAILABLE",
      "Серия не найдена",
      notFound ? 404 : 503,
      rid,
    );
    return c.json(errorBody, status as 404 | 503);
  }

  const finished = String(loaded.session.status) === "finished";
  return c.json(
    ok(
      {
        session_id: String(loaded.session.id),
        mode: loaded.session.mode,
        section: String(loaded.session.section || ""),
        timer_sec: loaded.session.timer_sec ?? null,
        status: loaded.session.status,
        total: Number(loaded.session.total_count ?? loaded.attempts.length),
        score: finished ? loaded.session.score ?? null : null,
        correct_count: finished ? loaded.session.correct_count ?? null : null,
        finished_at: loaded.session.finished_at ?? null,
        items: loaded.attempts.map((row) =>
          finished
            ? reviewOf(row)
            : {
                attempt_id: row.id,
                index: Number(row.session_index ?? 0),
                section: String(row.section || ""),
                question: row.question,
                answered: Boolean(row.answered_at),
                hints_total: MAX_HINTS,
              },
        ),
      },
      rid,
    ),
  );
});

/**
 * POST /diagnosticum/sessions/:id/finish — итог серии и разбор.
 *
 * Идемпотентно: повторный вызов возвращает тот же итог, а не ошибку, — клиент
 * может безопасно повторить запрос после обрыва связи.
 */
sessions.post("/sessions/:id/finish", requireAuth, async (c) => {
  const rid = requestId();
  const sessionId = String(c.req.param("id") || "");
  if (!UUID_PATTERN.test(sessionId)) {
    const { body: errorBody, status } = fail("VALIDATION_ERROR", "Некорректная серия", 422, rid);
    return c.json(errorBody, status as 422);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Сервис данных недоступен", 503, rid);
    return c.json(errorBody, status as 503);
  }

  const loaded = await loadOwnedSession(service, sessionId, c.get("user").id);
  if ("error" in loaded) {
    const notFound = loaded.error === "NOT_FOUND";
    const { body: errorBody, status } = fail(
      notFound ? "NOT_FOUND" : "DB_UNAVAILABLE",
      "Серия не найдена",
      notFound ? 404 : 503,
      rid,
    );
    return c.json(errorBody, status as 404 | 503);
  }

  const rows = loaded.attempts;
  const answered = rows.filter((row) => row.answered_at);
  const correctCount = answered.filter((row) => row.correct === true).length;
  const total = Number(loaded.session.total_count ?? rows.length);
  // Балл серии — среднее по всем вопросам, включая неотвеченные (0 баллов):
  // иначе пропуск половины серии выглядел бы как отличный результат.
  const score = total > 0 ? Math.round(answered.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / total) : 0;

  const alreadyFinished = String(loaded.session.status) === "finished";
  if (!alreadyFinished) {
    const update = await service
      .from("diagnosticum_sessions")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        score,
        correct_count: correctCount,
        total_count: total,
      })
      .eq("id", sessionId);
    if (update.error) {
      console.error("[diagnosticum:sessions:finish]", update.error.message, rid);
      const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Не удалось завершить серию", 503, rid);
      return c.json(errorBody, status as 503);
    }
  }

  return c.json(
    ok(
      {
        session_id: sessionId,
        status: "finished",
        total,
        answered: answered.length,
        skipped: total - answered.length,
        correct_count: correctCount,
        score: alreadyFinished ? loaded.session.score ?? score : score,
        items: rows.map(reviewOf),
      },
      rid,
    ),
  );
});

export default sessions;
