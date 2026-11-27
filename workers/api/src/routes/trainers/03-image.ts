import { fail, requestId } from "../../lib/response";
import { createAnonClient, createServiceClient } from "../../lib/supabase";
import { BlobError } from "@upstash/blob";
import { getBlobBucket, trainerImageCandidateKeys, findHistologyDriveItem, imageContentType, safeObjectKey } from "./shared";

import type { TrainersRouter } from "./types";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

const CARD_IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD_MEDIA_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export function registerImageRoutes(trainers: TrainersRouter) {
trainers.get("/feed/:id/image", async (c) => {
  const rid = requestId();
  // Public media endpoint: only published cards can resolve to image bytes.
  // Prefer the server-only service client for metadata lookups; fall back to anon + RLS.
  const supabase = createServiceClient(c.env) || createAnonClient(c.env);
  // Public Blob reads do not require UPSTASH_BLOB_TOKEN. This route intentionally
  // does not require a user session: it exposes bytes only for published cards.
  // Keep the SDK as a compatibility fallback only.
  const bucket = getBlobBucket(c.env);

  try {
    let cardResult = await supabase
      .from("trainer_feed_cards")
      .select("id,subject_slug,specialty_slug,preparation,source_key,mode_set,is_published")
      .eq("id", c.req.param("id"))
      .eq("is_published", true)
      .maybeSingle();

    // The feed can be served through the service-role fallback when user-scoped
    // RLS hides trainer cards. Image resolution must use the same fallback or it
    // incorrectly reports 404 for cards that are present in the feed.
    if (cardResult.error || !cardResult.data) {
      const { createServiceClient } = await import("../../lib/supabase");
      const service = createServiceClient(c.env);
      if (service) {
        const fallback = await service
          .from("trainer_feed_cards")
          .select("id,subject_slug,specialty_slug,preparation,source_key,mode_set,is_published")
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

    // ?variant=clean — версия скана БЕЗ подписей для вопросов тренажёра:
    // preparation.imageCleanUrl — полный публичный URL (Vercel-статика),
    // ставится SQL'ом 20261115_clean_em_urls. Подписанная версия остаётся
    // для атласа и объяснения после ответа.
    const wantsClean = c.req.query("variant") === "clean";
    const prep = (card.preparation as Record<string, any> | null) || null;

    // Бонус-снимки лежат на статике сайта (`preparation.imageStatic`), а не в
    // Blob. Отдаём редирект: файл уже кэшируется CDN, проксировать бинарник
    // через воркер незачем. Раньше такие карточки получали 404.
    const staticImage = typeof prep?.imageStatic === "string" ? prep.imageStatic.trim() : "";
    if (/^\/library\/[A-Za-z0-9._~/-]+$/.test(staticImage)) {
      return c.redirect(new URL(staticImage, new URL(c.req.url).origin).toString(), 302);
    }
    if (wantsClean && prep?.imageCleanUrl) {
      // Чистая версия лежит на Vercel-статике — redirect дешевле, чем
      // проксировать бинарник через воркер.
      const cleanUrl = String(prep.imageCleanUrl);
      if (/^https:\/\//.test(cleanUrl)) {
        return c.redirect(cleanUrl, 302);
      }
      // Fallback на blob-путь, если imageCleanUrl не URL, а blob-ключ.
      if (!sourceKeyLooksLikeUuid) {
        card.preparation = { ...prep, imagePath: String(prep.imageCleanPath || prep.imageCleanUrl) };
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

    // Temporary migration path: public Google Drive is the active histology source
    // while the Upstash Blob bucket credential is unavailable.
    //
    // Электронограммы — самая медленная часть тренажёра: uc?export=download
    // отдаёт оригинал в несколько МБ через медленный эндпоинт Drive. Картинки
    // по умолчанию идут РАСТРОВЫМ thumbnail (sz=w2000 — с запасом для ретины),
    // полный оригинал — только по ?variant=full. Кэш длинный: картинка карточки
    // неизменяема (ключ = id карточки), повторные открытия должны браться из
    // браузера/CDN без похода к воркеру.
    const wantsFull = c.req.query("variant") === "full";
    const MEDIA_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
    const isHistologyDriveCard =
      String((card as any).subject_slug || "") === "histology" &&
      String((card as any).specialty_slug || "") === "mbh";
    const driveItem = isHistologyDriveCard
      ? findHistologyDriveItem(
          { mode_set: (card as any).mode_set ?? null, preparation: card.preparation as Record<string, unknown> | null },
          candidates,
        )
      : null;
    if (driveItem) {
      const driveUrl = driveItem.kind === "image" && !wantsFull
        ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveItem.id)}&sz=w2000`
        : driveItem.kind === "image"
          ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveItem.id)}`
          : `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveItem.id)}&sz=w1600`;
      try {
        const driveResponse = await fetchWithTimeout(driveUrl, { redirect: "follow" });
        const driveContentType = driveResponse.headers.get("content-type") || driveItem.mime;
        if (driveResponse.ok && driveResponse.body && driveContentType.toLowerCase().startsWith("image/")) {
          return new Response(driveResponse.body, {
            headers: {
              "content-type": driveContentType,
              "cache-control": MEDIA_CACHE,
              "x-content-type-options": "nosniff",
              "x-request-id": rid,
              "x-mbh-media-key": driveItem.path,
              "x-mbh-image-resolver": wantsFull ? "google-drive-full" : "google-drive-thumbnail",
            },
          });
        }
        console.warn("[trainer-image:google-drive] image unavailable; falling back to Blob", {
          cardId: card.id,
          driveFileId: driveItem.id,
          status: driveResponse.status,
          contentType: driveContentType,
        });
      } catch (driveError) {
        console.warn("[trainer-image:google-drive] fetch failed; falling back to Blob", {
          cardId: card.id,
          driveFileId: driveItem.id,
          error: driveError instanceof Error ? driveError.message : String(driveError),
        });
      }
    }

    if (!candidates.length) {
      console.warn("[trainer-image] missing/invalid preparation image path", { cardId: card.id });
      const { body, status } = fail("MEDIA_URL_UNAVAILABLE", "Для изображения не задан корректный ключ хранилища", 503, rid);
      return c.json(body, status as 503);
    }

    let image: any = null;
    let resolvedKey = "";
    const key = candidates[0];

    const publicBlobBase = (c.env.UPSTASH_BLOB_PUBLIC_BASE_URL || "https://b8a4f9f853fa.blob.upstash.io").trim().replace(/\/+$/, "");
    for (const candidate of candidates) {
      const publicUrl = `${publicBlobBase}/${candidate.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
      try {
        const publicResponse = await fetchWithTimeout(publicUrl, { redirect: "follow" });
        if (publicResponse.ok && publicResponse.body) {
          return new Response(publicResponse.body, {
            headers: {
              "content-type": publicResponse.headers.get("content-type") || imageContentType(candidate),
              "cache-control": MEDIA_CACHE,
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
      if (bucket) {
        try {
          image = await bucket.get(candidate);
          if (image) { resolvedKey = candidate; break; }
        } catch (error) {
          if (BlobError.is(error) && error.code === "not_found") continue;
          // Public reads are the primary path; an invalid/expired private token
          // must not prevent already-public objects from being served.
          console.warn("[trainer-image] authenticated Blob fallback failed", {
            cardId: card.id,
            key: candidate,
            error: error instanceof Error ? error.message : String(error),
          });
        }
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
        "cache-control": MEDIA_CACHE,
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

/**
 * Дополнительные изображения карточки (таблица trainer_card_images).
 *
 * Публичный маршрут без сессии: байты отдаются только для опубликованной и
 * неархивной карточки, к которой изображение действительно привязано. Внешние
 * https-ссылки проксируются, а не редиректятся, чтобы клиент не зависел от
 * того, отдаёт ли сторонний хостинг CORS и свою авторизацию.
 */
trainers.get("/feed/:id/images/:imageId", async (c) => {
  const rid = requestId();
  const cardId = c.req.param("id");
  const imageId = c.req.param("imageId");
  if (!CARD_IMAGE_ID.test(imageId)) {
    const { body, status } = fail("NOT_FOUND", "Изображение не найдено", 404, rid);
    return c.json(body, status as 404);
  }

  const supabase = createServiceClient(c.env) || createAnonClient(c.env);
  try {
    const { data: card, error: cardError } = await supabase
      .from("trainer_feed_cards")
      .select("id,is_published,is_archived")
      .eq("id", cardId)
      .eq("is_published", true)
      .eq("is_archived", false)
      .maybeSingle();
    if (cardError) {
      console.error("[trainer-card-image:card]", cardError.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось получить карточку изображения", 503, rid);
      return c.json(body, status as 503);
    }
    if (!card) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }

    const { data: image, error: imageError } = await supabase
      .from("trainer_card_images")
      .select("id,card_id,object_key,external_url")
      .eq("id", imageId)
      .eq("card_id", cardId)
      .maybeSingle();
    if (imageError) {
      console.error("[trainer-card-image:row]", imageError.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось получить изображение", 503, rid);
      return c.json(body, status as 503);
    }
    if (!image) {
      const { body, status } = fail("NOT_FOUND", "Изображение не найдено", 404, rid);
      return c.json(body, status as 404);
    }

    const externalUrl = typeof image.external_url === "string" ? image.external_url.trim() : "";
    if (/^https:\/\//i.test(externalUrl)) {
      const upstream = await fetchWithTimeout(externalUrl, { redirect: "follow" });
      const upstreamType = upstream.headers.get("content-type") || "";
      if (upstream.ok && upstream.body && upstreamType.toLowerCase().startsWith("image/")) {
        return new Response(upstream.body, {
          headers: {
            "content-type": upstreamType,
            "cache-control": CARD_MEDIA_CACHE,
            "x-content-type-options": "nosniff",
            "x-request-id": rid,
            "x-mbh-image-resolver": "external-url",
          },
        });
      }
      console.warn("[trainer-card-image:external]", { cardId, imageId, status: upstream.status, contentType: upstreamType });
    }

    const objectKey = safeObjectKey(String(image.object_key || ""));
    if (objectKey) {
      const publicBlobBase = (c.env.UPSTASH_BLOB_PUBLIC_BASE_URL || "https://b8a4f9f853fa.blob.upstash.io").trim().replace(/\/+$/, "");
      const publicUrl = `${publicBlobBase}/${objectKey.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
      try {
        const upstream = await fetchWithTimeout(publicUrl, { redirect: "follow" });
        if (upstream.ok && upstream.body) {
          return new Response(upstream.body, {
            headers: {
              "content-type": upstream.headers.get("content-type") || imageContentType(objectKey),
              "cache-control": CARD_MEDIA_CACHE,
              "x-content-type-options": "nosniff",
              "x-request-id": rid,
              "x-mbh-image-resolver": "public-blob",
            },
          });
        }
      } catch (publicError) {
        console.warn("[trainer-card-image:public]", {
          cardId,
          imageId,
          error: publicError instanceof Error ? publicError.message : String(publicError),
        });
      }

      const bucket = getBlobBucket(c.env);
      if (bucket) {
        try {
          const object = await bucket.get(objectKey);
          if (object) {
            return new Response(object.body, {
              headers: {
                "content-type": object.contentType || imageContentType(objectKey),
                "cache-control": CARD_MEDIA_CACHE,
                "x-content-type-options": "nosniff",
                "x-request-id": rid,
                "x-mbh-image-resolver": "blob-sdk",
              },
            });
          }
        } catch (bucketError) {
          console.warn("[trainer-card-image:sdk]", {
            cardId,
            imageId,
            error: bucketError instanceof Error ? bucketError.message : String(bucketError),
          });
        }
      }
    }

    const { body, status } = fail("MEDIA_NOT_FOUND", "Файл изображения отсутствует", 404, rid);
    return c.json(body, status as 404);
  } catch (error) {
    console.error("[trainer-card-image]", error);
    const { body, status } = fail("MEDIA_URL_UNAVAILABLE", "Не удалось получить изображение", 503, rid);
    return c.json(body, status as 503);
  }
});
}
