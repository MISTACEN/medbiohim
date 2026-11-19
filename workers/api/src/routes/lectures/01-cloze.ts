import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { rateLimit } from "../../lib/redis";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection, withAiCall } from "../../lib/ai-usage";
import { clozeBodyHash, extractBoldClozeItems, validateClozeItems } from "../../lib/cloze-text";
import { generateClozeDraft, loadLectureForCloze, clozeCache, clozeCacheKey } from "./shared";

import type { LecturesRouter } from "./types";

export function registerClozeRoutes(lectures: LecturesRouter) {
lectures.get("/:id/cloze", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  const service = clozeCache(c);
  if (!service) return c.json(ok({ lecture_id: id, items: [], cached: false, available: false }, rid));
  try {
    const lecture = await loadLectureForCloze(c.get("supabase"), id, c.get("user").id);
    if (!lecture) return c.json(ok({ lecture_id: id, items: [], cached: false, available: true }, rid));
    const hash = await clozeBodyHash(lecture.body_markdown);
    const { data, error } = await service
      .from("site_content")
      .select("payload")
      .eq("key", clozeCacheKey(id, hash))
      .maybeSingle();
    if (error) throw error;
    const items = Array.isArray(data?.payload?.items) ? data.payload.items : [];
    return c.json(ok({ lecture_id: id, items, cached: items.length > 0, available: true }, rid));
  } catch (error) {
    console.warn("[lectures:cloze:cache]", error instanceof Error ? error.message : "unavailable");
    return c.json(ok({ lecture_id: id, items: [], cached: false, available: false }, rid));
  }
});

lectures.post("/:id/cloze", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const id = String(c.req.param("id") || "");
  const rl = await rateLimit(c.env, `lecture:cloze:${user.id}`, 12, 600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много генераций конспекта. Подождите несколько минут.", 429, rid);
    return c.json(body, status as 429);
  }
  try {
    const supabase = c.get("supabase");
    const lecture = await loadLectureForCloze(supabase, id, c.get("user").id);
    if (!lecture) {
      const { body, status } = fail("NOT_FOUND", "Лекция не найдена или не опубликована", 404, rid);
      return c.json(body, status as 404);
    }
    const text = String(lecture.body_markdown || "").slice(0, 14000).trim();
    if (text.length < 400) {
      const { body, status } = fail("LECTURE_TOO_SHORT", "Текст лекции слишком короткий для пропусков", 422, rid);
      return c.json(body, status as 422);
    }
    const cacheKey = clozeCacheKey(id, await clozeBodyHash(lecture.body_markdown));
    const service = clozeCache(c);
    if (service) {
      const { data: cached } = await service
        .from("site_content")
        .select("payload")
        .eq("key", cacheKey)
        .maybeSingle();
      const items = Array.isArray(cached?.payload?.items) ? cached.payload.items : [];
      if (items.length) {
        return c.json(ok({ lecture_id: id, items, cached: true, available: true }, rid));
      }
    }

    // 1) Детерминированный путь — мгновенный и без ИИ.
    let items = validateClozeItems(extractBoldClozeItems(text), text.replace(/\*\*/g, ""));
    let provider = "markdown";
    let model = "bold-terms";

    // 2) ИИ — только если разметки не хватило.
    const buildPrompt = (excerpt: number, count: string, context: number) => [
      "Ты собираешь интерактивный конспект с пропусками по тексту лекции.",
      `Выдели ${count} ключевых терминов (не служебных слов) из приведённого текста.`,
      "ЖЁСТКОЕ ПРАВИЛО: для каждого пункта строк before + answer + after должна быть ДОСЛОВНОЙ цитатой из текста лекции — символ в символ, без переформулировок.",
      `before — до ${context} символов текста перед термином, after — до ${context} символов после; answer — сам термин.`,
      "Формат ответа — строго JSON без markdown-обёртки:",
      '{"items":[{"before":"…","answer":"термин","after":"…","hint":"подсказка"}]}',
      "",
      "=== ТЕКСТ ЛЕКЦИИ ===",
      text.slice(0, excerpt),
    ].join("\n");
    if (items.length < 4) {
      const prompt = buildPrompt(14000, "8–15", 120);
      const compactPrompt = buildPrompt(6000, "6–10", 60);
      // ИИ-путь — дорогая генерация: детерминированный разбор выше бесплатен,
      // поэтому квота проверяется только здесь.
      const quota = await aiDailyQuota(c.env, "lecture_cloze", user.id);
      if (!quota.allowed) {
        await logAiQuotaRejection(c.env, {
          route: "POST /lectures/:id/cloze",
          feature: "lecture_cloze",
          userId: user.id,
          subjectSlug: lecture.subject_slug,
          requestId: rid,
        });
        const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(quota, "lecture_cloze"), 429, rid);
        return c.json(body, status as 429);
      }
      const result = await withAiCall(
        c.env,
        {
          route: "POST /lectures/:id/cloze",
          feature: "lecture_cloze",
          userId: user.id,
          subjectSlug: lecture.subject_slug,
          requestId: rid,
        },
        () => generateClozeDraft(c.env, prompt, compactPrompt),
      );
      let draft: { items?: unknown } = {};
      const rawText = String(result.content || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      try {
        draft = JSON.parse(rawText);
      } catch {
        const match = /\{[\s\S]*"items"[\s\S]*\}/.exec(String(result.content || ""));
        if (match) draft = JSON.parse(match[0]);
        else {
          const { body, status } = fail("AI_BAD_OUTPUT", "ИИ вернул неожиданный формат — попробуйте ещё раз", 502, rid);
          return c.json(body, status as 502);
        }
      }
      items = validateClozeItems(draft.items, text);
      provider = result.provider;
      model = result.model;
      if (items.length < 4) {
        const { body, status } = fail(
          "CLOZE_UNUSABLE",
          "ИИ не выдержал дословные цитаты из лекции — попробуйте ещё раз",
          502,
          rid,
        );
        return c.json(body, status as 502);
      }
    }

    if (service) {
      try {
        await service.from("site_content").upsert({
          key: cacheKey,
          payload: {
            lecture_id: id,
            items,
            provider,
            model,
            generated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
      } catch (cacheError) {
        // Кэш — ускорение, а не условие работы.
        console.warn("[lectures:cloze:write]", cacheError instanceof Error ? cacheError.message : "unavailable");
      }
    }
    return c.json(ok({ lecture_id: id, items, cached: false, available: true, provider, model }, rid));
  } catch (error) {
    console.error("[lectures:cloze]", error);
    const code = String((error as any)?.code || "");
    if (code === "no_provider_configured" || code === "requested_provider_not_configured") {
      const { body, status } = fail("AI_NOT_CONFIGURED", "Не настроен доступный AI-провайдер", 503, rid);
      return c.json(body, status as 503);
    }
    const { body, status } = fail("AI_UPSTREAM", "ИИ-провайдеры временно недоступны", 502, rid);
    return c.json(body, status as 502);
  }
});
}
