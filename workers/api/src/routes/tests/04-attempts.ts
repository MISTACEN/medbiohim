import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, invalid, rpcResult } from "./shared";

import type { TestsRouter } from "./types";

export function registerAttemptRoutes(tests: TestsRouter) {
async function startAttempt(c: any, rid: string, testId: string) {
  const db = c.get("supabase");
  const groupId = c.req.query("group_id");
  if (!UUID.test(testId) || (groupId && !UUID.test(groupId))) return invalid(c, rid, "Некорректный ID теста или группы");
  try {
    const { data, error } = await db.rpc("medbiohim_start_test_attempt", { p_test_id: testId, p_group_id: groupId || null });
    return rpcResult(c, rid, data, error, "Не удалось начать тест", "attempt");
  } catch {
    const { body, status } = fail("ATTEMPT_START_UNAVAILABLE", "Не удалось начать тест", 503, rid);
    return c.json(body, status as 503);
  }
}

tests.post("/:id/start", requireAuth, async (c) => startAttempt(c, requestId(), (c.req.param("id") ?? "")));

tests.post("/:id/attempts", requireAuth, async (c) => startAttempt(c, requestId(), (c.req.param("id") ?? "")));

tests.post("/attempts/:id/answers", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID попытки");
  let p: any;
  try { p = await c.req.json(); } catch { return invalid(c, rid, "Некорректный JSON"); }
  if (!p || typeof p !== "object" || Array.isArray(p) || !UUID.test(String(p.question_id || ""))) return invalid(c, rid, "Нужен корректный question_id");
  const answer = p.answer_text !== undefined ? p.answer_text : p.answer;
  if (answer !== null && answer !== undefined && typeof answer !== "string" && typeof answer !== "number" && typeof answer !== "boolean" && !Array.isArray(answer) && typeof answer !== "object") return invalid(c, rid, "Некорректный формат ответа");
  if (typeof answer === "string" && answer.length > 20000) {
    const { body, status } = fail("PAYLOAD_TOO_LARGE", "Ответ слишком длинный", 413, rid);
    return c.json(body, status as 413);
  }
  try {
    const { data, error } = await db.rpc("medbiohim_save_test_answer", { p_attempt_id: id, p_question_id: p.question_id, p_answer_text: answer == null ? null : typeof answer === "string" ? answer : JSON.stringify(answer) });
    if (error) {
      const { body, status } = fail("ANSWER_SAVE_ERROR", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    return rpcResult(c, rid, data, null, "Не удалось сохранить ответ", "answer", true);
  } catch {
    const { body, status } = fail("ANSWER_SAVE_ERROR", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.post("/attempts/:id/finish", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID попытки");
  try {
    const { data, error } = await db.rpc("medbiohim_finish_test_attempt", { p_attempt_id: id });
    if (!error) {
      // Фаза 5: завершение теста — событие ленты (сбой записи не влияет на ответ).
      const { logActivity } = await import("../../lib/activity");
      // RPC отвечает {ok, data:{attempt}}, старый формат — {attempt} на верхнем
      // уровне: берём оба, иначе освоенность темы не записывалась.
      const attempt: any = (data as any)?.attempt ?? (data as any)?.data?.attempt ?? null;
      await logActivity(c.env, {
        userId: c.get("user").id,
        kind: "test_finished",
        refId: id,
        payload: attempt
          ? { percent: attempt.percent ?? null, score: attempt.score ?? null, max_score: attempt.max_score ?? null }
          : {},
      });
      // Готовность к событию и слабые темы считаются из user_topic_progress,
      // поэтому лучшая попытка теста обновляет освоенность его темы.
      if (attempt?.test_id) {
        const { recordTopicMastery } = await import("../../lib/topic-mastery");
        await recordTopicMastery(db, c.get("user").id, String(attempt.test_id), attempt.percent);
      }
    }
    return rpcResult(c, rid, data, error, "Не удалось завершить попытку", "attempt");
  } catch {
    const { body, status } = fail("ATTEMPT_FINISH_UNAVAILABLE", "Не удалось завершить попытку", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.post("/attempts/:id/cards", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID попытки");
  const MAX_CARDS = 100;
  // «Повторение ошибок»: экран результата присылает id вопросов, отвеченных
  // неверно. Фильтр по снимку попытки — источник правды остаётся на сервере,
  // клиент не может подсунуть чужие вопросы: их просто нет в snapshot.
  let onlyIds: string[] = [];
  try {
    const body: any = await c.req.json();
    if (Array.isArray(body?.question_ids)) {
      onlyIds = body.question_ids.filter((value: unknown) => typeof value === "string" && UUID.test(value)).slice(0, 200);
    }
  } catch {
    // Пустое тело — обычный режим (все вопросы попытки).
  }
  try {
    const { data: attempt, error } = await db
      .from("test_attempts")
      .select("id,test_id,status,question_snapshot,tests(title,subject_id)")
      .eq("id", id).eq("user_id", c.get("user").id)
      .maybeSingle();
    if (error) throw error;
    if (!attempt) {
      const { body, status } = fail("NOT_FOUND", "Попытка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    if (String(attempt.status || "") !== "submitted") {
      const { body, status } = fail("VALIDATION_ERROR", "Сначала завершите тест", 422, rid);
      return c.json(body, status as 422);
    }
    const snapshot: any[] = Array.isArray(attempt.question_snapshot) ? attempt.question_snapshot : [];
    const wanted = new Set(onlyIds);
    const selected = wanted.size ? snapshot.filter((question) => wanted.has(String(question?.id || ""))) : snapshot;
    if (wanted.size && !selected.length) {
      const { body, status } = fail("NO_MISTAKES", "В этой попытке нет ошибок для повторения", 422, rid);
      return c.json(body, status as 422);
    }
    const seen = new Set<string>();
    const items: Array<{ front: string; back: string }> = [];
    for (const question of selected) {
      const front = String(question?.text || "").trim().slice(0, 1000);
      if (!front || seen.has(front)) continue;
      const options = Array.isArray(question?.options) ? question.options : [];
      const correct = options.find((option: any) => option?.correct === true);
      const fallback = String(question?.answer || "").replace(/^Верный ответ:\s*/i, "").trim();
      const back = String(correct?.label || fallback || "").trim().slice(0, 1000);
      if (!back) continue;
      seen.add(front);
      items.push({ front, back });
      if (items.length >= MAX_CARDS) break;
    }
    if (!items.length) {
      const { body, status } = fail("NO_CARDS", "В этой попытке нет вопросов с известным ответом", 422, rid);
      return c.json(body, status as 422);
    }

    const testTitle = String((attempt as any)?.tests?.title || "Тест").slice(0, 150);
    const subjectId = String((attempt as any)?.tests?.subject_id || "");
    let subjectSlug: string | null = null;
    if (subjectId && UUID.test(subjectId)) {
      const { data: subject } = await db.from("subjects").select("slug").eq("id", subjectId).limit(1).maybeSingle();
      subjectSlug = subject?.slug ? String(subject.slug) : null;
    }

    const { data: pack, error: packError } = await db
      .from("card_packs")
      .insert({
        owner_id: c.get("user").id,
        title: `${wanted.size ? "Из ошибок" : "Из теста"}: ${testTitle}`.slice(0, 200),
        description: wanted.size
          ? `Карточки по вопросам, отвеченным неверно в тесте «${testTitle}».`
          : `Карточки собраны из вопросов теста «${testTitle}» после завершения попытки.`,
        subject_slug: subjectSlug,
        source: "user",
        is_published: false,
        published_at: null,
      })
      .select("id")
      .single();
    if (packError) throw packError;

    const rows = items.map((item, index) => ({ pack_id: pack.id, front: item.front, back: item.back, order_index: index }));
    for (let i = 0; i < rows.length; i += 25) {
      const { error: itemsError } = await db.from("card_pack_items").insert(rows.slice(i, i + 25));
      if (itemsError) throw itemsError;
    }
    return c.json(ok({ pack_id: pack.id, card_count: items.length }, rid), 201);
  } catch (createError) {
    console.error("[tests:attempt-cards]", createError);
    const { body, status } = fail("CARDS_CREATE_FAILED", "Не удалось собрать карточки", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.post("/attempts/:attemptId/answers/:questionId/regrade", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), attemptId = (c.req.param("attemptId") ?? ""), questionId = (c.req.param("questionId") ?? "");
  if (!UUID.test(attemptId) || !UUID.test(questionId)) return invalid(c, rid, "Некорректный ID попытки или вопроса");
  try {
    const { data, error } = await db.rpc("medbiohim_regrade_test_answer", { p_attempt_id: attemptId, p_question_id: questionId });
    return rpcResult(c, rid, data, error, "Не удалось повторно проверить ответ", "answer");
  } catch {
    const { body, status } = fail("GRADING_RETRY_ERROR", "Не удалось повторно проверить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});
}
