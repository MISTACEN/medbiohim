import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { rateLimit } from "../lib/redis";
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
 * выбрасываются. Готовый набор кэшируется в site_content (`cloze:<lecture_id>`),
 * чтобы не тратить квоты на повторные открытия.
 */
const CLOZE_CACHE_PREFIX = "cloze:";

type ClozeItem = { before: string; answer: string; after: string; hint: string };

function normalizeLoose(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Оставляем только пункты, которые дословно присутствуют в тексте лекции. */
export function validateClozeItems(raw: unknown, body: string): ClozeItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const haystack = normalizeLoose(body);
  const seen = new Set<string>();
  const items: ClozeItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const before = String(row.before ?? "").trim();
    const answer = String(row.answer ?? "").trim();
    const after = String(row.after ?? "").trim();
    if (!answer || answer.length < 2 || answer.length > 80) continue;
    if (before.length > 240 || after.length > 240) continue;
    const key = normalizeLoose(answer);
    if (!key || seen.has(key)) continue;
    const needle = normalizeLoose(before + " " + answer + " " + after);
    if (!needle || !haystack.includes(needle)) continue;
    seen.add(key);
    items.push({
      before,
      answer,
      after,
      hint: String(row.hint ?? "").trim().slice(0, 60) || `${answer.slice(0, 1)}… (${answer.length} симв.)`,
    });
    if (items.length >= 15) break;
  }
  return items;
}

async function loadLectureForCloze(supabase: any, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
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

// GET /lectures/:id/cloze — только кэш: открытие без ожидания ИИ.
lectures.get("/:id/cloze", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  const service = clozeCache(c);
  if (!service) return c.json(ok({ lecture_id: id, items: [], cached: false, available: false }, rid));
  try {
    const { data, error } = await service
      .from("site_content")
      .select("payload")
      .eq("key", CLOZE_CACHE_PREFIX + id)
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
    const service = clozeCache(c);
    if (service) {
      const { data: cached } = await service
        .from("site_content")
        .select("payload")
        .eq("key", CLOZE_CACHE_PREFIX + id)
        .maybeSingle();
      const items = Array.isArray(cached?.payload?.items) ? cached.payload.items : [];
      if (items.length) {
        return c.json(ok({ lecture_id: id, items, cached: true, available: true }, rid));
      }
    }

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

    const prompt = [
      "Ты собираешь интерактивный конспект с пропусками по тексту лекции.",
      "Выдели 8–15 ключевых терминов (не служебных слов) из приведённого текста.",
      "ЖЁСТКОЕ ПРАВИЛО: для каждого пункта строк before + answer + after должна быть ДОСЛОВНОЙ цитатой из текста лекции — символ в символ, без переформулировок.",
      "before — до 120 символов текста перед термином, after — до 120 символов после; answer — сам термин.",
      "Формат ответа — строго JSON без markdown-обёртки:",
      '{"items":[{"before":"…","answer":"термин","after":"…","hint":"подсказка"}]}',
      "",
      "=== ТЕКСТ ЛЕКЦИИ ===",
      text,
    ].join("\n");
    const result = await generateAiCompletion(
      c.env,
      [{ role: "user", content: prompt.slice(0, 24000) }],
      "auto",
      fetch,
      { temperature: 0.2 },
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
    const items = validateClozeItems(draft.items, text);
    if (items.length < 4) {
      const { body, status } = fail(
        "CLOZE_UNUSABLE",
        "ИИ не выдержал дословные цитаты из лекции — попробуйте ещё раз",
        502,
        rid,
      );
      return c.json(body, status as 502);
    }

    if (service) {
      try {
        await service.from("site_content").upsert({
          key: CLOZE_CACHE_PREFIX + id,
          payload: {
            lecture_id: id,
            items,
            provider: result.provider,
            model: result.model,
            generated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
      } catch (cacheError) {
        // Кэш — ускорение, а не условие работы.
        console.warn("[lectures:cloze:write]", cacheError instanceof Error ? cacheError.message : "unavailable");
      }
    }
    return c.json(ok({ lecture_id: id, items, cached: false, available: true, provider: result.provider, model: result.model }, rid));
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
    return c.json(ok(data, rid));
  } catch (error) {
    console.error("[lectures:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default lectures;
