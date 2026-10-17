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
  plan_module_id?: string | null;
  plan_topic_id?: string | null;
  plan_status?: string | null;
  modules?: { title?: string | null } | Array<{ title?: string | null }> | null;
  topics?: { title?: string | null } | Array<{ title?: string | null }> | null;
  is_published?: boolean;
};

function cleanLegacyPath(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/^content\/histology\//, "")
    .replace(/^histology\//, "");
}

function safeObjectKey(value: string): string {
  const key = String(value || "").trim();
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[?#\u0000-\u001f\u007f]/u.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

/** Expand relative/absolute paths into bare + histology/ + content/histology/ forms. */
function withHistologyPrefixes(relativeOrAbsolute: string): string[] {
  const keys: string[] = [];
  const add = (v: string) => {
    const k = safeObjectKey(v);
    if (k && !keys.includes(k)) keys.push(k);
  };
  const raw = String(relativeOrAbsolute || "").trim().replace(/^\/+/, "");
  if (!raw) return keys;
  add(raw);
  const stripped = cleanLegacyPath(raw);
  if (stripped) {
    add("histology/" + stripped); // live public bucket layout
    add(stripped);
    add("content/histology/" + stripped);
  }
  return keys;
}

/**
 * Ordered Blob object keys for a trainer card.
 * Live bucket uses histology/… prefix (verified: histology/electronograms/images/apoptoz.png = 200).
 * Cards often store only a basename in preparation.imagePath — expand under photo roots.
 */
// roots include "photos/" for legacy aliases
function trainerImageCandidateKeys(card: {
  source_key?: string | null;
  mode_set?: string | null;
  preparation?: Record<string, unknown> | null;
}, fileObjectKey: string | null = null): string[] {
  const keys: string[] = [];
  const add = (v: string) => {
    for (const k of withHistologyPrefixes(v)) {
      if (!keys.includes(k)) keys.push(k);
    }
  };

  if (fileObjectKey) {
    add(fileObjectKey);
    return keys;
  }

  if (card.source_key) add(String(card.source_key));

  const preparation = card.preparation && typeof card.preparation === "object" ? card.preparation : {};
  const imagePath = cleanLegacyPath(String(preparation.imagePath || ""));
  const imageUrl = cleanLegacyPath(String(preparation.imageUrl || ""));
  add(imagePath);
  add(imageUrl);

  const base = (imagePath || imageUrl).split("/").pop() || "";
  if (base && !base.includes("..")) {
    if (card.mode_set === "electronogram") {
      add("electronograms/images/" + base);
      add("em/" + base);
    }
    // preparation (and unknown mode): try SpaceWeb photo tree
    if (card.mode_set === "preparation" || !card.mode_set) {
      const photoRoot = "5_Фотографии препаратов/";
      const subfolders = [
        "",
        "частная гистология/",
        "цитология, эмбриология и общая гистология/",
        "стом. гистология/",
      ];
      if (imagePath.includes("/")) add(photoRoot + imagePath);
      if (imageUrl.includes("/")) add(photoRoot + imageUrl);
      for (const sub of subfolders) add(photoRoot + sub + base);
    }
  }
  return keys;
}

/** Strict single-key helper kept for has_image mapping. */
function histologyObjectKey(preparation: Record<string, unknown> | null | undefined): string | null {
  const keys = trainerImageCandidateKeys({ preparation, mode_set: null }, null);
  return keys.find((k) => k.startsWith("histology/")) || keys[0] || null;
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
  const moduleRow = Array.isArray(row.modules) ? row.modules[0] : row.modules;
  const topicRow = Array.isArray(row.topics) ? row.topics[0] : row.topics;
  return {
    id: row.id,
    plan_module_id: row.plan_module_id || null,
    plan_topic_id: row.plan_topic_id || null,
    plan_status: row.plan_status || null,
    plan_module_title: moduleRow?.title || null,
    plan_topic_title: topicRow?.title || null,
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
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  const subject = c.req.query("subject");
  const specialty = c.req.query("specialty");
  const topic = c.req.query("topic");
  try {
    const select = "id,subject_slug,specialty_slug,mode_set,source_key,preparation,question,tags,difficulty,is_published,created_at,plan_module_id,plan_topic_id,plan_status,modules(title),topics(title)";
    const applyFilters = (query: any) => {
      let next = query.eq("is_published", true);
      if (subject) next = next.eq("subject_slug", subject);
      if (specialty) next = next.eq("specialty_slug", specialty);
      if (topic) next = next.contains("tags", [topic]);
      return next.order("created_at", { ascending: true }).range(offset, offset + limit - 1);
    };
    let { data, error } = await applyFilters(supabase.from("trainer_feed_cards").select(select));
    if (error) {
      console.warn("[trainers:feed] user-scoped query failed; trying published-only service query", error.message);
      const { createServiceClient } = await import("../lib/supabase");
      const service = createServiceClient(c.env);
      if (service) {
        const fallback = await applyFilters(service.from("trainer_feed_cards").select(select));
        data = fallback.data;
        error = fallback.error;
      }
    }
    if (error) {
      console.error("[trainers:feed]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    const items = ((data || []) as TrainerRow[]).map((row, index) => mapTrainerCard(row, offset + index));
    return c.json(ok({ items, limit, offset, source: "supabase" }, rid));
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
      .select("id,subject_slug,specialty_slug,mode_set,source_key,preparation,question,tags,difficulty,is_published,plan_module_id,plan_topic_id,plan_status,modules(title),topics(title)")
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
    let cardResult = await supabase
      .from("trainer_feed_cards")
      .select("id,preparation,source_key,mode_set,is_published")
      .eq("id", c.req.param("id"))
      .eq("is_published", true)
      .maybeSingle();

    // The feed can be served through the service-role fallback when user-scoped
    // RLS hides trainer cards. Image resolution must use the same fallback or it
    // incorrectly reports 404 for cards that are present in the feed.
    if (cardResult.error || !cardResult.data) {
      const { createServiceClient } = await import("../lib/supabase");
      const service = createServiceClient(c.env);
      if (service) {
        const fallback = await service
          .from("trainer_feed_cards")
          .select("id,preparation,source_key,mode_set,is_published")
          .eq("id", c.req.param("id"))
          .eq("is_published", true)
          .maybeSingle();
        if (!fallback.error && fallback.data) cardResult = fallback;
        else if (fallback.error) console.error("[trainer-image:service-fallback]", fallback.error.message);
      }
    }

    const { data: card, error } = cardResult;
    if (error) {
      console.error("[trainer-image:card-query]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось получить карточку изображения", 503, rid);
      return c.json(body, status as 503);
    }
    if (!card) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    if (!card.is_published) {
      const { body, status } = fail("NOT_FOUND", "У карточки нет изображения", 404, rid);
      return c.json(body, status as 404);
    }

    let fileObjectKey: string | null = null;
    const sourceKey = typeof card.source_key === "string" ? card.source_key.trim() : "";
    // Many EM cards store a Blob-relative path in source_key (not a content_sources UUID).
    // Only query content_sources when the key looks like a UUID — otherwise path lookup throws / 22P02.
    const sourceKeyLooksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceKey);
    if (sourceKeyLooksLikeUuid) {
      const { data: source, error: sourceError } = await supabase.from("content_sources")
        .select("source_path,file_id")
        .eq("id", sourceKey)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (source?.file_id) {
        const { data: file, error: fileError } = await supabase.from("files")
          .select("object_key,mime_type")
          .eq("id", source.file_id)
          .maybeSingle();
        if (fileError) throw fileError;
        const objectKey = typeof file?.object_key === "string" ? file.object_key.trim() : "";
        if (objectKey) fileObjectKey = objectKey;
      }
      if (source?.source_path && !(card.preparation as any)?.imagePath) {
        card.preparation = { ...(card.preparation as object || {}), imagePath: source.source_path };
      }
    }

    const candidates = trainerImageCandidateKeys(
      {
        source_key: card.source_key,
        mode_set: (card as any).mode_set ?? null,
        preparation: card.preparation as Record<string, unknown> | null,
      },
      fileObjectKey,
    );

    if (!candidates.length) {
      console.warn("[trainer-image] missing/invalid preparation image path", { cardId: card.id });
      const { body, status } = fail("MEDIA_URL_UNAVAILABLE", "Для изображения не задан корректный ключ хранилища", 503, rid);
      return c.json(body, status as 503);
    }

    let image: any = null;
    let resolvedKey = "";
    const key = candidates[0];

    const publicBlobBase = "https://b8a4f9f853fa.blob.upstash.io";
    for (const candidate of candidates) {
      const publicUrl = `${publicBlobBase}/${candidate.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
      try {
        const publicResponse = await fetch(publicUrl, { redirect: "follow" });
        if (publicResponse.ok && publicResponse.body) {
          return new Response(publicResponse.body, {
            headers: {
              "content-type": publicResponse.headers.get("content-type") || imageContentType(candidate),
              "cache-control": "public, max-age=3600",
              "x-content-type-options": "nosniff",
              "x-request-id": rid,
              "x-mbh-media-key": candidate,
              "x-mbh-image-resolver": "v2",
            },
          });
        }
        if (publicResponse.status === 404) {
          console.warn("[trainer-image] public URL returned 404; falling back to authenticated Blob SDK", { cardId: card.id, key: candidate });
        }
      } catch (error) {
        console.warn("[trainer-image] public Blob URL lookup failed; trying authenticated SDK", {
          cardId: card.id,
          key: candidate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        image = await bucket.get(candidate);
        if (image) { resolvedKey = candidate; break; }
      } catch (error) {
        if (BlobError.is(error) && error.code === "not_found") continue;
        throw error;
      }
    }
    if (!image) {
      console.warn("[trainer-image] object not found", { cardId: card.id, candidates });
      const { body, status } = fail("MEDIA_NOT_FOUND", "Файл изображения отсутствует в Upstash Blob", 404, rid);
      if (body && typeof body === "object" && (body as any).error) {
        (body as any).error.details = { resolver: "v2", tried: candidates.slice(0, 12) };
      }
      return c.json(body, status as 404);
    }

    return new Response(image.body, {
      headers: {
        "content-type": image.contentType || imageContentType(key),
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "x-request-id": rid,
        "x-mbh-media-key": resolvedKey,
        "x-mbh-image-resolver": "v2",
      },
    });
  } catch (error) {
    console.error("[trainer-image]", error);
    const { body, status } = fail("MEDIA_URL_UNAVAILABLE", "Не удалось получить изображение из хранилища", 503, rid);
    return c.json(body, status as 503);
  }
});

export default trainers;
