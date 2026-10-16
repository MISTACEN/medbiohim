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

/** The DB stores paths relative to the migrated content/histology directory. */
function histologyObjectKey(sourceKey: unknown): string | null {
  if (typeof sourceKey !== "string") return null;
  let key = sourceKey.trim().replace(/^\/content\/histology\//, "");
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f\u007f]/u.test(key)) return null;
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  // Keep reads restricted to the known, shared histology media tree.
  if (!["electronograms/", "em/", "5_Фотографии препаратов/"].some((prefix) => key.startsWith(prefix))) return null;
  return key;
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
  const limit = Math.min(Number(c.req.query("limit") || 30), 100);
  const topic = c.req.query("topic");
  try {
    let q = supabase
      .from("trainer_feed_cards")
      .select("id,title,topic,kind,order_index,has_image")
      .order("order_index", { ascending: true })
      .limit(limit);
    if (topic) q = q.eq("topic", topic);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.get("/feed/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    // Never return answer keys before submission.
    const { data, error } = await supabase
      .from("trainer_feed_cards")
      .select("id,title,topic,kind,prompt,options,has_image,order_index")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Карточка недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.post("/feed/answer", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: { card_id?: string; answer?: string } = {};
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

    const { data: inserted, error: insErr } = await supabase
      .from("trainer_feed_answers")
      .insert({
        card_id: payload.card_id,
        user_id: user.id,
        answer: payload.answer ?? null,
      })
      .select("id,card_id,is_correct,explanation")
      .maybeSingle();
    if (insErr) {
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
      .select("id,has_image,source_key")
      .eq("id", c.req.param("id"))
      .maybeSingle();

    if (error || !card) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    if (!card.has_image) {
      const { body, status } = fail("NOT_FOUND", "У карточки нет изображения", 404, rid);
      return c.json(body, status as 404);
    }

    const key = histologyObjectKey(card.source_key);
    if (!key) {
      console.warn("[trainer-image] missing/invalid source_key", { cardId: card.id });
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
