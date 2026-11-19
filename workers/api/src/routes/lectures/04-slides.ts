import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { rateLimit } from "../../lib/redis";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection, withAiCall } from "../../lib/ai-usage";
import { clozeBodyHash } from "../../lib/cloze-text";
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";
import { loadLectureForCloze, clozeCache, normalizeSlides } from "./shared";

import type { LecturesRouter } from "./types";

export function registerSlideRoutes(lectures: LecturesRouter) {
lectures.post("/:id/slides", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const id = String(c.req.param("id") || "");
  const rl = await rateLimit(c.env, `lecture:slides:${user.id}`, 6, 600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много презентаций подряд. Подождите пару минут.", 429, rid);
    return c.json(body, status as 429);
  }
  try {
    const lecture = await loadLectureForCloze(c.get("supabase"), id, c.get("user").id);
    if (!lecture) {
      const { body, status } = fail("NOT_FOUND", "Лекция не найдена или не опубликована", 404, rid);
      return c.json(body, status as 404);
    }
    const text = String(lecture.body_markdown || "").replace(/[#*_>`]/g, " ").slice(0, 14000).trim();
    if (text.length < 400) {
      const { body, status } = fail("LECTURE_TOO_SHORT", "Текст лекции слишком короткий для презентации", 422, rid);
      return c.json(body, status as 422);
    }

    const service = clozeCache(c);
    const cacheKey = service ? `slides:v1:${id}:${await clozeBodyHash(lecture.body_markdown || "")}` : null;
    if (service && cacheKey) {
      const { data: cached } = await service
        .from("site_content")
        .select("payload")
        .eq("key", cacheKey)
        .maybeSingle();
      const slides = normalizeSlides(cached?.payload?.slides);
      if (slides) {
        return c.json(ok({ lecture_id: id, title: lecture.title || "", slides, cached: true }, rid));
      }
    }

    const quota = await aiDailyQuota(c.env, "lecture_slides", user.id);
    if (!quota.allowed) {
      await logAiQuotaRejection(c.env, {
        route: "POST /lectures/:id/slides",
        feature: "lecture_slides",
        userId: user.id,
        subjectSlug: lecture.subject_slug,
        requestId: rid,
      });
      const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(quota, "lecture_slides"), 429, rid);
      return c.json(body, status as 429);
    }

    const result = await withAiCall<{ content?: string; provider?: string; model?: string }>(
      c.env,
      { route: "POST /lectures/:id/slides", feature: "lecture_slides", userId: user.id, subjectSlug: lecture.subject_slug, requestId: rid, attempts: [] },
      () => generateAiCompletion(
        c.env,
        [
          {
            role: "user",
            content: [
              "Ты собираешь презентацию по лекции для студента-медика: 8–12 слайдов.",
              "СТРОГОЕ ПРАВИЛО: каждый факт бери ДОСЛОВНО из текста лекции, ничего не добавляй извне.",
              "Слайд: короткий заголовок (до 8 слов) и 3–4 пункта-тезиса (до 80 знаков каждый!).",
              "Порядок — как в лекции; последний слайд — «Ключевые термины» (3–4 термина).",
              "JSON должен быть КОМПАКТНЫМ: провайдер обрезает длинные ответы.",
              "Формат ответа — строго JSON без markdown-обёртки:",
              '{"slides":[{"title":"…","bullets":["…","…"]}]}',
              "",
              "=== ТЕКСТ ЛЕКЦИИ ===",
              text,
            ].join("\n"),
          },
        ],
        "auto",
        fetch,
        { temperature: 0.15 },
      ),
    );
    const rawText = String(result.content || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const tryParse = (value: string): unknown => {
      try {
        return JSON.parse(value);
      } catch {
        const match = /\{[\s\S]*"slides"[\s\S]*\}/.exec(value);
        if (match) {
          try { return JSON.parse(match[0]); } catch { return null; }
        }
        return null;
      }
    };
    let parsed = tryParse(rawText);
    // Провайдеры иногда обрезают длинный JSON или оборачивают пояснениями:
    // один строгий повтор дешевле, чем «презентация не собирается».
    if (!parsed) {
      // Голова ответа в логе: видно, что вернула модель (обрезка, пояснения, прозу).
      console.warn("[lectures:slides:retry-json]", { requestId: rid, provider: result.provider, head: rawText.slice(0, 400), tail: rawText.slice(-200) });
      try {
        const retry = await generateAiCompletion(
          c.env,
          [
            { role: "user", content: text.slice(0, 8000) },
            { role: "assistant", content: rawText.slice(0, 4000) },
            { role: "user", content: "Ответ не был валидным JSON (вероятно, обрезан). Верни КОМПАКТНЫЙ валидный JSON вида {\"slides\":[{\"title\":\"…\",\"bullets\":[\"…\"]}]}, 8–12 слайдов, пункты до 60 знаков, и ничего больше." },
          ],
          "auto",
          fetch,
          { temperature: 0 },
        );
        parsed = tryParse(String(retry.content || ""));
      } catch (retryError) {
        console.warn("[lectures:slides:retry-failed]", String(retryError).slice(0, 200));
      }
    }
    const slides = normalizeSlides(parsed);
    if (!slides) {
      console.error("[lectures:slides:unusable]", { requestId: rid, head: rawText.slice(0, 400) });
      const { body, status } = fail("SLIDES_BAD_OUTPUT", "ИИ не собрал презентацию — попробуйте ещё раз", 502, rid);
      return c.json(body, status as 502);
    }

    if (service && cacheKey) {
      try {
        await service.from("site_content").upsert({
          key: cacheKey,
          payload: { lecture_id: id, slides, provider: result.provider, model: result.model, generated_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
      } catch (cacheError) {
        // Кэш — ускорение, а не условие работы.
        console.warn("[lectures:slides:write]", cacheError instanceof Error ? cacheError.message : "unavailable");
      }
    }
    return c.json(ok({ lecture_id: id, title: lecture.title || "", slides, cached: false, provider: result.provider, model: result.model }, rid));
  } catch (error) {
    console.error("[lectures:slides]", error);
    const { body, status } = fail("SLIDES_FAILED", "Не удалось собрать презентацию", 502, rid);
    return c.json(body, status as 502);
  }
});
}
