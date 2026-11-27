/**
 * Отдача снимка из «Своих препаратов» после одобрения в атлас.
 *
 * Файл лежит в B2 (`files.object_key`), а карточка атласа хранит только
 * `preparation.fileId`: подписанная ссылка B2 живёт час, поэтому картинку
 * отдаёт воркер и кэширует её как обычный медиа-ответ.
 */
import type { Context } from "hono";
import { createServiceClient } from "../../lib/supabase";
import { getStorageBackend } from "../../lib/b2";
import { imageContentType } from "./shared";

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_MEDIA_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export async function userPreparationImageResponse(
  c: Context<any, any, any>,
  fileId: string,
  rid: string,
): Promise<Response | null> {
  if (!FILE_ID.test(fileId)) return null;
  const service = createServiceClient(c.env);
  const backend = getStorageBackend(c.env);
  if (!service || !backend) return null;

  const { data: file, error } = await service
    .from("files")
    .select("object_key,status")
    .eq("id", fileId)
    .maybeSingle();
  if (error) {
    console.warn("[trainer-image:user-file]", error.message);
    return null;
  }
  const objectKey = typeof file?.object_key === "string" ? file.object_key.trim() : "";
  // Удалённый или деактивированный файл не отдаём: снимок мог быть отозван.
  if (!objectKey || file?.status !== "active") return null;

  try {
    const object = await backend.get(objectKey);
    return new Response(object.body, {
      headers: {
        "content-type": object.contentType || imageContentType(objectKey),
        "cache-control": USER_MEDIA_CACHE,
        "x-content-type-options": "nosniff",
        "x-request-id": rid,
        "x-mbh-image-resolver": "user-file",
      },
    });
  } catch (storageError) {
    console.warn("[trainer-image:user-file:get]", String(storageError));
    return null;
  }
}
