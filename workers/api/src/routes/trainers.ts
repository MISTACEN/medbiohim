import { Hono } from "hono";
import { BlobError, Bucket } from "@upstash/blob";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const trainers = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function getBlobBucket(env: Env): Bucket | null {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  return token ? new Bucket({ token, enableTelemetry: false, cache: "no-store" }) : null;
}

type TrainerRow = {
  id: string;
  subject_slug?: string | null;
  specialty_slug?: string | null;
  mode_set?: string | null;
  source_key?: string | null;
  preparation?: Record<string, unknown> | null;
  question?: Record<string, unknown> | null;
  tags?: string[] | null;
  difficulty?: number | null;
  is_published?: boolean;
};

function histologyObjectKey(preparation: Record<string, unknown> | null | undefined): string | null {
  if (!preparation) return null;
  const imageUrl = typeof preparation.imageUrl === "string" ? preparation.imageUrl : "";
  const imagePath = typeof preparation.imagePath === "string" ? preparation.imagePath : "";
  let key = imageUrl || imagePath;
  key = key.trim().replace(/^\/content\/histology\//, "");
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f\u007f]/u.test(key)) return null;
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  // Only paths from the migrated histology content tree may be served.
  if (!["electronograms/", "em/", "5_Фотографии препаратов/"].some((prefix) => key.startsWith(prefix))) return null;
  return `histology/${key}`;
}

function mapTrainerCard(row: TrainerRow, orderIndex: number) {
  const preparation = row.preparation || {};
  const question = (row.question || {}) as { prompt?: unknown; mode?: unknown; options?: unknown };
  const options = Array.isArray(question.options)
    ? question.options.map((option: unknown, index: number) => {
        const item = option as { id?: unknown; label?: unknown };
        return { id: String(item.id ?? index), label: String(item.label ?? "") };
      })
    : [];
  return {
    id: row.id,
    title: String(preparation.name || preparation.organ || question.prompt || "Карточка тренажёра"),
    topic: Array.isArray(row.tags) ? String(row.tags[0] || row.subject_slug || "histology") : (row.subject_slug || "histology"),
    kind: row.mode_set || String(question.mode || "identify"),
    order_index: orderIndex,
    has_image: Boolean(preparation.imageUrl || preparation.imagePath),
    prompt: String(question.prompt || ""),
    options,
    preparation,
    tags: row.tags || [],
    difficulty: row.difficulty ?? null,
  };
}

function imageContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

trainers.get("/feed", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 30), 1), 100);
  const topic = c.req.query("topic");
  try {
    let query = supabase
      .from("trainer_feed_cards")
      .select("id,subject_slug,specialty_slug,mode_set,source_key,preparation,question,tags,difficulty,is_published,created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (topic) query = query.contains("tags", [topic]);
    const { data, error } = await query;
    if (error) {
      console.error("[trainers:feed]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    const items = ((data || []) as TrainerRow[]).map((row, index) => mapTrainerCard(row, index));
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[trainers:feed]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.get("/feed/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("trainer_feed_cards")
      .select("id,subject_slug,specialty_slug,mode_set,source_key,preparation,question,tags,difficulty,is_published")
      .eq("id", c.req.param("id"))
      .eq("is_published", true)
      .maybeSingle();
    if (error || !data) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(mapTrainerCard(data as TrainerRow, 0), rid));
  } catch (error) {
    console.error("[trainers:feed-card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Карточка недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.post("/feed/answer", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: { card_id?: string; answer?: string; option_id?: string; answer_text?: string; is_skipped?: boolean; time_ms?: number } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!payload.card_id) {
    const { body, status } = fail("VALIDATION", "Нужен card_id", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await supabase.rpc("trainer_feed_submit_answer", {
      p_card_id: payload.card_id,
      p_answer: payload.answer ?? null,
    });
    if (!error && data) return c.json(ok(data, rid));

    // Compatibility fallback for deployments without the scoring RPC.
    // Correctness is computed server-side from the stored question JSON.
    const { data: card, error: cardError } = await supabase
      .from("trainer_feed_cards")
      .select("question")
      .eq("id", payload.card_id)
      .eq("is_published", true)
      .maybeSingle();
    if (cardError || !card) {
      const { body, status } = fail("NOT_FOUND", "Карточка тренажёра не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    const answerValue = String(payload.option_id || payload.answer || payload.answer_text || "").trim();
    const question = (card.question || {}) as { options?: unknown };
    const options = Array.isArray(question.options) ? question.options as { id?: unknown; label?: unknown; correct?: unknown }[] : [];
    const selected = options.find((option) =>
      String(option.id ?? "") === answerValue || String(option.label ?? "").trim().toLocaleLowerCase() === answerValue.toLocaleLowerCase()
    );
    const isSkipped = payload.is_skipped === true || !answerValue;
    const { data: inserted, error: insErr } = await supabase
      .from("trainer_feed_answers")
      .insert({
        card_id: payload.card_id,
        user_id: user.id,
        option_id: selected ? String(selected.id ?? "") : null,
        answer_text: selected ? null : (answerValue || null),
        is_skipped: isSkipped,
        is_correct: isSkipped ? null : (selected ? Boolean(selected.correct) : false),
        time_ms: Number.isFinite(payload.time_ms) ? Math.max(0, Math.min(3600000, Number(payload.time_ms))) : null,
      })
      .select("id,card_id,option_id,answer_text,is_correct,is_skipped,time_ms,created_at")
      .maybeSingle();
    if (insErr) {
      console.error("[trainers:answer]", insErr.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(inserted, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.get("/feed/:id/image", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const bucket = getBlobBucket(c.env);
  if (!bucket) {
    const { body, status } = fail("NOT_CONFIGURED", "Хранилище Upstash Blob не настроено", 503, rid);
    return c.json(body, status as 503);
  }

  try {
    const { data: card, error } = await supabase
      .from("trainer_feed_cards")
      .select("id,preparation,source_key,is_published")
      .eq("id", c.req.param("id"))
      .maybeSingle();

    if (error || !card) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    if (!card.is_published) {
      const { body, status } = fail("NOT_FOUND", "У карточки нет изображения", 404, rid);
      return c.json(body, status as 404);
    }

    const key = histologyObjectKey(card.preparation as Record<string, unknown> | null);
    if (!key) {
      console.warn("[trainer-image] missing/invalid preparation image path", { cardId: card.id });
      const { body, status } = fail("MEDIA_URL_UNAVAILABLE", "Для изображения не задан корректный ключ хранилища", 503, rid);
      return c.json(body, status as 503);
    }

    let image;
    try {
      image = await bucket.get(key);
    } catch (error) {
      if (BlobError.is(error) && error.code === "not_found") {
        console.warn("[trainer-image] object not found", { cardId: card.id, key });
        const { body, status } = fail("MEDIA_NOT_FOUND", "Файл изображения отсутствует в Upstash Blob", 404, rid);
        return c.json(body, status as 404);
      }
      throw error;
    }

    return new Response(image.body, {
      headers: {
        "content-type": image.contentType || imageContentType(key),
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "x-request-id": rid,
        "x-mbh-media-key": "upstash-blob",
      },
    });
  } catch (error) {
    console.error("[trainer-image]", error);
    const { body, status } = fail("MEDIA_URL_UNAVAILABLE", "Не удалось получить изображение из хранилища", 503, rid);
    return c.json(body, status as 503);
  }
});

export default trainers;
