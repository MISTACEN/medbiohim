import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { rateLimit } from "../../lib/redis";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection, withAiCall } from "../../lib/ai-usage";
import { clozeBodyHash } from "../../lib/cloze-text";
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";
import { loadLectureForCloze, clozeCache, pcmToWav, base64ToBytes, bytesToBase64 } from "./shared";

import type { LecturesRouter } from "./types";

export function registerMediaRoutes(lectures: LecturesRouter) {
lectures.post("/:id/cheatsheet", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const id = String(c.req.param("id") || "");
  const rl = await rateLimit(c.env, `lecture:cheatsheet:${user.id}`, 10, 600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много шпаргалок подряд.", 429, rid);
    return c.json(body, status as 429);
  }
  try {
    const lecture = await loadLectureForCloze(c.get("supabase"), id, c.get("user").id);
    if (!lecture) {
      const { body, status } = fail("NOT_FOUND", "Лекция не найдена или не опубликована", 404, rid);
      return c.json(body, status as 404);
    }
    const text = String(lecture.body_markdown || "").slice(0, 14000).trim();
    if (text.length < 400) {
      const { body, status } = fail("LECTURE_TOO_SHORT", "Текст лекции слишком короткий для шпаргалки", 422, rid);
      return c.json(body, status as 422);
    }
    const hash = await clozeBodyHash(lecture.body_markdown);
    const cacheKey = `cheatsheet:v1:${id}:${hash.slice(0, 12)}`;
    const service = clozeCache(c);
    if (service) {
      const { data: cached } = await service.from("site_content").select("payload").eq("key", cacheKey).maybeSingle();
      const content = String(cached?.payload?.content || "").trim();
      if (content) return c.json(ok({ lecture_id: id, title: lecture.title || "", content, cached: true }, rid));
    }

    const quota = await aiDailyQuota(c.env, "lecture_cheatsheet", user.id);
    if (!quota.allowed) {
      await logAiQuotaRejection(c.env, {
        route: "POST /lectures/:id/cheatsheet",
        feature: "lecture_cheatsheet",
        userId: user.id,
        subjectSlug: lecture.subject_slug,
        requestId: rid,
      });
      const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(quota, "lecture_cheatsheet"), 429, rid);
      return c.json(body, status as 429);
    }

    const result = await withAiCall<{ content?: string; provider?: string; model?: string }>(
      c.env,
      { route: "POST /lectures/:id/cheatsheet", feature: "lecture_cheatsheet", userId: user.id, subjectSlug: lecture.subject_slug, requestId: rid, attempts: [] },
      () => generateAiCompletion(
        c.env,
        [
          {
            role: "user",
            content: [
              "Сожми лекцию в шпаргалку на один лист А4 для подготовки к занятию.",
              "Только факты из текста, ничего извне. Без вступлений и воды.",
              "Формат — markdown: 4–7 блоков с заголовками ## и короткими пунктами; термины выделяй **жирным**.",
              "В конце блок «## Запомнить» — 3–5 самых спрашиваемых фактов одним списком.",
              `Лекция: «${lecture.title || "без названия"}».`,
              "",
              "=== ТЕКСТ ЛЕКЦИИ ===",
              text,
            ].join("\n"),
          },
        ],
        "auto",
        fetch,
        { temperature: 0.2 },
      ),
    );
    const content = String(result.content || "").trim().slice(0, 12000);
    if (content.length < 100) {
      const { body, status } = fail("CHEATSHEET_EMPTY", "ИИ не смог собрать шпаргалку", 502, rid);
      return c.json(body, status as 502);
    }
    if (service) {
      await service.from("site_content").upsert(
        { key: cacheKey, payload: { content, title: lecture.title || "", lecture_id: id, updated_at: new Date().toISOString() } },
        { onConflict: "key" },
      ).then(() => undefined, () => undefined);
    }
    return c.json(ok({ lecture_id: id, title: lecture.title || "", content, cached: false }, rid));
  } catch (error) {
    console.error("[lectures:cheatsheet]", error);
    const { body, status } = fail("CHEATSHEET_FAILED", "Не удалось собрать шпаргалку", 502, rid);
    return c.json(body, status as 502);
  }
});

lectures.post("/:id/podcast", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const id = String(c.req.param("id") || "");
  const rl = await rateLimit(c.env, `lecture:podcast:${user.id}`, 4, 600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много подкастов подряд. Подождите пару минут.", 429, rid);
    return c.json(body, status as 429);
  }
  try {
    const lecture = await loadLectureForCloze(c.get("supabase"), id, c.get("user").id);
    if (!lecture) {
      const { body, status } = fail("NOT_FOUND", "Лекция не найдена или не опубликована", 404, rid);
      return c.json(body, status as 404);
    }
    const text = String(lecture.body_markdown || "").replace(/[#*_>`]/g, " ").slice(0, 12000).trim();
    if (text.length < 400) {
      const { body, status } = fail("LECTURE_TOO_SHORT", "Текст лекции слишком короткий для подкаста", 422, rid);
      return c.json(body, status as 422);
    }
    const apiKey = String(c.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      const { body, status } = fail("PODCAST_NOT_CONFIGURED", "Озвучка не настроена на сервере (нет GEMINI_API_KEY)", 503, rid);
      return c.json(body, status as 503);
    }
    const quota = await aiDailyQuota(c.env, "lecture_podcast", user.id);
    if (!quota.allowed) {
      await logAiQuotaRejection(c.env, {
        route: "POST /lectures/:id/podcast",
        feature: "lecture_podcast",
        userId: user.id,
        subjectSlug: lecture.subject_slug,
        requestId: rid,
      });
      const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(quota, "lecture_podcast"), 429, rid);
      return c.json(body, status as 429);
    }

    const result = await withAiCall<{ content?: string; provider?: string; model?: string }>(
      c.env,
      { route: "POST /lectures/:id/podcast", feature: "lecture_podcast", userId: user.id, subjectSlug: lecture.subject_slug, requestId: rid, attempts: [] },
      () => generateAiCompletion(
        c.env,
        [
          {
            role: "user",
            content: [
              "Ты пишешь сценарий аудио-подкаста-диалога по лекции для студента-медика.",
              "Диалог двух голосов: ВЕДУЩИЙ объясняет материал лекции, СТУДЕНТ задаёт короткие",
              "уточняющие вопросы и пересказывает своими словами — как живой разговор на кухне общежития.",
              "Строго по тексту лекции, без добавления фактов извне.",
              "Длина — 8–12 обменов репликами (120–220 слов суммарно): вступление, ключевые факты,",
              "студент переспрашивает самое сложное, короткий вывод.",
              "Формат каждой реплики СТРОГО: «Ведущий: текст» или «Студент: текст» — новой строкой,",
              "без списков, без markdown, без сносок. Имена реплик нужны озвучке для выбора голоса.",
              `Лекция: «${lecture.title || "без названия"}».`,
              "",
              "=== ТЕКСТ ЛЕКЦИИ ===",
              text,
            ].join("\n"),
          },
        ],
        "auto",
        fetch,
        { temperature: 0.2 },
      ),
    );
    const script = String(result.content || "").replace(/\s+/g, " ").trim().slice(0, 2000);
    if (script.length < 80) {
      const { body, status } = fail("PODCAST_EMPTY", "ИИ не смог собрать сценарий", 502, rid);
      return c.json(body, status as 502);
    }
    // Диалог должен содержать обе роли, иначе озвучка прочитает его одним голосом.
    if (!/Ведущий:/i.test(script) || !/Студент:/i.test(script)) {
      const { body, status } = fail("PODCAST_EMPTY", "ИИ вернул монолог вместо диалога — попробуйте ещё раз", 502, rid);
      return c.json(body, status as 502);
    }

    const ttsResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: script }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            // Диалог двух голосов: Ведущий объясняет, Студент спрашивает.
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  { speaker: "Ведущий", voiceName: "Kore" },
                  { speaker: "Студент", voiceName: "Puck" },
                ],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!ttsResponse.ok) {
      const detail = (await ttsResponse.text()).slice(0, 300);
      console.error("[lectures:podcast:tts]", ttsResponse.status, detail);
      const { body, status } = fail("PODCAST_TTS_FAILED", "Озвучка не удалась — попробуйте позже", 502, rid);
      return c.json(body, status as 502);
    }
    const payload: any = await ttsResponse.json().catch(() => null);
    const inline = payload?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      const { body, status } = fail("PODCAST_TTS_FAILED", "Озвучка вернула пустой ответ", 502, rid);
      return c.json(body, status as 502);
    }
    const wav = pcmToWav(base64ToBytes(String(inline.data)));
    return c.json(
      ok({ lecture_id: id, title: lecture.title || "", script, mime: "audio/wav", audio_base64: bytesToBase64(wav), seconds: Math.round(script.length / 15) }, rid),
    );
  } catch (error) {
    console.error("[lectures:podcast]", error);
    const { body, status } = fail("PODCAST_FAILED", "Не удалось собрать подкаст", 502, rid);
    return c.json(body, status as 502);
  }
});
}
