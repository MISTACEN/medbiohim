import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { workersAiComplete, workersAiConfigured } from "../lib/workers-ai";
import { rateLimit } from "../lib/redis";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection, withAiCall } from "../lib/ai-usage";
import { CLOZE_CACHE_PREFIX, clozeBodyHash, extractBoldClozeItems, validateClozeItems } from "../lib/cloze-text";
// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../integrations/cloudflare-api/src/ai-chat.js";

const lectures = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * Фаза 4 дорожной карты: конспект с пропусками (cloze).
 *
 * ИИ выделяет термины, но публикуется только то, что дословно есть в тексте
 * лекции: каждый пункт проверяется подстрокой `before+answer+after`. Так модель
 * не может выдумать формулировку или переврать термин — неверные пункты просто
 * выбрасываются. Готовый набор кэшируется в site_content
 * (`cloze:v1:<lecture_id>`), чтобы не тратить квоты на повторные открытия.
 * Версия в ключе растёт вместе с промптом и валидацией: иначе после правки
 * фильтра отдавались бы старые пункты.
 */

/**
 * id лекции — ТЕКСТОВЫЙ ключ (`lec-44db6ebee0344e24`, `hist-00-gistotekhnika`,
 * `histology-mbh-study-blood-core`), а не UUID: в таблице 85 из 85 строк такие.
 * Проверка на UUID отбрасывала все лекции и отдавала 404 — этот баг поймал
 * живой E2E на временном пользователе.
 */
const LECTURE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Внешние ИИ-провайдеры (groq/gigachat/mistral) в проде могут отказать все
 * сразу — тогда конспект отдавал 502, хотя тьютор в этот момент отвечал через
 * биндинг Workers AI. Тот же последний фолбэк, что у тьютора: промпт короче
 * (модель поменьше), цитаты тоже короче.
 */
async function generateClozeDraft(
  env: any,
  prompt: string,
  compactPrompt: string,
): Promise<{ content: string; provider: string; model: string }> {
  try {
    const result = await generateAiCompletion(
      env,
      [{ role: "user", content: prompt.slice(0, 24000) }],
      "auto",
      fetch,
      { temperature: 0.2 },
    );
    return { content: String(result.content || ""), provider: result.provider, model: result.model };
  } catch (error) {
    if (!workersAiConfigured(env)) throw error;
    console.error("[lectures:cloze:workers-ai]", error instanceof Error ? error.message : String(error));
    const result = await workersAiComplete(
      env,
      [{ role: "user", content: compactPrompt }],
      { temperature: 0.2, maxTokens: 1200 },
    );
    return { content: String(result.content || ""), provider: result.provider, model: result.model };
  }
}

async function loadLectureForCloze(supabase: any, id: string) {
  if (!LECTURE_ID.test(id)) return null;
  const { data, error } = await supabase
    .from("histology_lectures")
    .select("id,title,subject_slug,body_markdown,is_published")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function clozeCache(c: any) {
  try {
    return createServiceClient(c.env);
  } catch {
    return null;
  }
}

// Ключ кэша привязан к хэшу текста лекции: правка лекции или версии разбора
// даёт новый ключ, а не устаревший набор пропусков из site_content.
function clozeCacheKey(id: string, hash: string): string {
  return `${CLOZE_CACHE_PREFIX}${id}:${hash}`;
}

// GET /lectures/:id/cloze — только кэш: открытие без ожидания ИИ.
lectures.get("/:id/cloze", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  const service = clozeCache(c);
  if (!service) return c.json(ok({ lecture_id: id, items: [], cached: false, available: false }, rid));
  try {
    const lecture = await loadLectureForCloze(c.get("supabase"), id);
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

// POST /lectures/:id/cloze — сгенерировать (и закэшировать) пропуски.
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
    const lecture = await loadLectureForCloze(supabase, id);
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

lectures.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subject = c.req.query("subject_id") || c.req.query("subject_slug") || c.req.query("subject");
  try {
    let q = supabase
      .from("histology_lectures")
      .select("id,subject_slug,specialty_scope,title,kind,prep_names,linked_prep_ids,body_markdown,description_algorithm_ref,is_published,created_at,updated_at")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .limit(300);
    if (subject) {
      if (/^[0-9a-f-]{36}$/i.test(subject)) {
        const { data: subjectRow } = await supabase.from("subjects").select("slug").eq("id", subject).maybeSingle();
        if (!subjectRow?.slug) return c.json(ok({ items: [] }, rid));
        q = q.eq("subject_slug", subjectRow.slug);
      } else {
        q = q.eq("subject_slug", subject);
      }
    }
    const { data, error } = await q;
    if (error) {
      console.error("[lectures:list]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лекции недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[lectures:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лекции недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Аудио-конспект лекции («подкаст», roadmap 2.5.3).
 * Сценарий пишет LLM строго по тексту лекции, озвучка — Gemini TTS.
 * Gemini отдаёт сырой PCM (audio/L16), поэтому заворачиваем его в WAV-заголовок:
 * браузеры не умеют проигрывать L16 напрямую.
 */

/** WAV-обёртка для PCM 16-bit mono. */
function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1, bits = 16): Uint8Array {
  const blockAlign = (channels * bits) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Шпаргалка по лекции (аудит «Школы Сеченова», раздел cheat sheets):
 * сжатый конспект на один печатный лист, только факты из текста лекции.
 * Кэш привязан к хэшу тела, чтобы повторное открытие не тратило квоту.
 */
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
    const lecture = await loadLectureForCloze(c.get("supabase"), id);
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
    const lecture = await loadLectureForCloze(c.get("supabase"), id);
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
              "Ты пишешь сценарий короткого аудио-конспекта (подкаста) по лекции для студента-медика.",
              "Строго по тексту лекции, без добавления фактов извне.",
              "Длина — 120–180 слов: вступление одной фразой, 3–4 ключевых факта, вывод одной фразой.",
              "Пиши так, как говорят вслух: короткие предложения, без списков, без markdown и без сносок.",
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
    const script = String(result.content || "").replace(/\s+/g, " ").trim().slice(0, 1200);
    if (script.length < 80) {
      const { body, status } = fail("PODCAST_EMPTY", "ИИ не смог собрать сценарий", 502, rid);
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
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
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

lectures.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id") || "";
  try {
    const { data, error } = await supabase
      .from("histology_lectures")
      .select("id,subject_slug,specialty_scope,title,kind,prep_names,linked_prep_ids,body_markdown,description_algorithm_ref,is_published,created_at,updated_at")
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) {
      console.error("[lectures:detail]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Лекция не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    // Фаза 5: открытие лекции — событие ленты.
    await logActivity(c.env, {
      userId: c.get("user").id,
      kind: "lecture_opened",
      subjectSlug: (data as any).subject_slug ?? null,
      refId: String((data as any).id || id),
    });
    return c.json(ok(data, rid));
  } catch (error) {
    console.error("[lectures:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default lectures;
