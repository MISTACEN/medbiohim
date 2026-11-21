/**
 * Document Bridge: MEDBIOHIM отдаёт PdfMentor содержимое файла.
 *
 * Вызывается только сервером PdfMentor, без пользовательской сессии — поэтому
 * вместо `requireAuth` здесь HMAC-подпись от `BRIDGE_SECRET` и явный `user_id`
 * в подписанном коде: подделать чужого пользователя нельзя.
 *
 * Права перепроверяются на каждой выдаче (никаких «одобрено один раз»): отзыв
 * группы закрывает доступ со следующего запроса. Каждое чтение пишется в
 * `bridge_document_reads`.
 *
 * Поток отдаётся телом ответа, а не редиректом на подписанный URL: иначе ранее
 * выданная ссылка жила бы после отзыва доступа.
 */
import { Hono } from "hono";
import { fail, ok, requestId } from "../../lib/response";
import { rateLimit } from "../../lib/redis";
import { createServiceClient } from "../../lib/supabase";
import { getStorageBackend } from "../../lib/b2";
import type { Env } from "../../env";
import {
  BRIDGE_SIGNATURE_HEADER,
  BRIDGE_TIMESTAMP_HEADER,
  documentBridgeCode,
  verifyBridgeSignature,
} from "./model";

const documents = new Hono<{ Bindings: Env }>();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Колонки `files`, которые реально существуют: имя — `original_name` (а не
 * `name`), хеш — `sha256` (а не `checksum`). Версии оригинала в MEDBIOHIM нет:
 * `file_variants` — производные, а версия документа заводится в PdfMentor.
 */
type BridgeFile = {
  id: string;
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  object_key?: string | null;
  specialty_slug?: string | null;
  sha256?: string | null;
};

type AccessFailure = { status: 403 | 404 | 503; message: string; code: string };

function isUuid(value: unknown): boolean {
  return UUID_PATTERN.test(String(value ?? "").trim());
}

/** Специальность файла: гистология живёт в группе МБХ. */
function requiredSpecialty(file: BridgeFile): string {
  const raw = String(file.specialty_slug || "").trim();
  return raw === "histology" || raw === "mbh" ? "mbh" : raw;
}

/** Файл доступен, только если он на подключённом хранилище пользователя или histology. */
function storageKeyAllowed(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/`) || key.startsWith("histology/");
}

async function loadAccessibleFile(
  env: Env,
  fileId: string,
  userId: string,
): Promise<{ file: BridgeFile } | { failure: AccessFailure }> {
  const service = createServiceClient(env);
  if (!service) {
    return { failure: { status: 503, code: "DB_UNAVAILABLE", message: "Сервисный доступ к базе не настроен" } };
  }

  const { data: file, error } = await service
    .from("files")
    .select("id,original_name,mime_type,size_bytes,object_key,specialty_slug,sha256,status")
    .eq("id", fileId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[bridge:documents:file]", error.message);
    return { failure: { status: 503, code: "DB_UNAVAILABLE", message: "Не удалось проверить файл" } };
  }
  if (!file) {
    return { failure: { status: 404, code: "NOT_FOUND", message: "Файл не найден" } };
  }

  const specialty = requiredSpecialty(file as BridgeFile);
  if (specialty) {
    const { data: groups, error: groupsError } = await service
      .from("groups")
      .select("id")
      .eq("specialty_slug", specialty)
      .eq("is_active", true);
    if (groupsError) {
      console.error("[bridge:documents:groups]", groupsError.message);
      return { failure: { status: 503, code: "DB_UNAVAILABLE", message: "Не удалось проверить доступ" } };
    }
    const groupIds = (groups || []).map((row: { id: string }) => row.id).filter(Boolean);
    const { data: memberships, error: membershipError } = groupIds.length
      ? await service
          .from("group_memberships")
          .select("group_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .in("group_id", groupIds)
          .limit(1)
      : { data: [], error: null as unknown };
    if (membershipError) {
      console.error("[bridge:documents:membership]", String(membershipError));
      return { failure: { status: 503, code: "DB_UNAVAILABLE", message: "Не удалось проверить доступ" } };
    }
    if (!memberships || !memberships.length) {
      return { failure: { status: 403, code: "FORBIDDEN", message: "Файл недоступен пользователю" } };
    }
  }

  const key = String((file as BridgeFile).object_key || "");
  if (!storageKeyAllowed(key, userId)) {
    return {
      failure: { status: 403, code: "FORBIDDEN", message: "Файл хранится в неподключённом архиве" },
    };
  }

  return { file: file as BridgeFile };
}

/**
 * Проверка подписи чтения. `signature` покрывает `document:<file>:<user>` —
 * значит, переставить пользователя в запросе нельзя.
 */
async function verifyDocumentRequest(
  env: Env,
  fileId: string,
  userId: string,
  timestamp: string | undefined,
  signature: string | undefined,
): Promise<boolean> {
  const result = await verifyBridgeSignature({
    secret: env.BRIDGE_SECRET,
    code: documentBridgeCode(fileId, userId),
    timestamp,
    signature,
  });
  return result.ok;
}

async function auditRead(
  env: Env,
  entry: { fileId: string; userId: string; outcome: string; bytes?: number | null },
): Promise<void> {
  const service = createServiceClient(env);
  if (!service) return;
  const { error } = await service.from("bridge_document_reads").insert({
    file_id: entry.fileId,
    user_id: entry.userId,
    outcome: entry.outcome,
    bytes: entry.bytes ?? null,
  });
  if (error) console.error("[bridge:documents:audit]", error.message);
}

/** POST /mentor/documents/access — «можно ли этому пользователю читать файл». */
documents.post("/documents/access", async (c) => {
  const rid = requestId();
  if (c.env.MENTOR_ENABLED === "0") {
    const { body, status } = fail("MENTOR_DISABLED", "Встроенный режим выключен", 503, rid);
    return c.json(body, status as 503);
  }

  let payload: { file_id?: unknown; user_id?: unknown } = {};
  try {
    payload = (await c.req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const fileId = String(payload.file_id ?? "").trim().toLowerCase();
  const userId = String(payload.user_id ?? "").trim().toLowerCase();
  if (!isUuid(fileId) || !isUuid(userId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны file_id и user_id (uuid)", 422, rid);
    return c.json(body, status as 422);
  }

  const signed = await verifyDocumentRequest(
    c.env,
    fileId,
    userId,
    c.req.header(BRIDGE_TIMESTAMP_HEADER),
    c.req.header(BRIDGE_SIGNATURE_HEADER),
  );
  if (!signed) {
    const { body, status } = fail("UNAUTHORIZED", "Подпись бриджа не принята", 401, rid);
    return c.json(body, status as 401);
  }

  const limit = await rateLimit(c.env, `bridge:access:${userId}`, 120, 60);
  if (!limit.allowed) {
    const { body, status } = fail("RATE_LIMITED", "Слишком много проверок доступа", 429, rid);
    return c.json(body, status as 429);
  }

  const access = await loadAccessibleFile(c.env, fileId, userId);
  if ("failure" in access) {
    await auditRead(c.env, { fileId, userId, outcome: access.failure.status === 403 ? "forbidden" : "not_found" });
    // Для проверки доступа «нельзя» — это ответ 200 с allowed:false.
    return c.json(
      ok(
        {
          allowed: false,
          reason: access.failure.code,
          file: null,
        },
        rid,
      ),
    );
  }

  const file = access.file;
  return c.json(
    ok(
      {
        allowed: true,
        file: {
          id: file.id,
          name: file.original_name ?? null,
          mime_type: file.mime_type ?? null,
          size_bytes: file.size_bytes ?? null,
          // Версия оригинала в MEDBIOHIM пока не ведётся — PdfMentor заводит
          // свою при регистрации внешнего источника; checksum — это sha256 файла.
          version: null,
          checksum: file.sha256 ?? null,
        },
        content_url: `/api/v1/mentor/documents/${file.id}/content?user_id=${userId}`,
      },
      rid,
    ),
  );
});

/** GET /mentor/documents/:id/content?user_id=… — поток файла после проверки прав. */
documents.get("/documents/:id/content", async (c) => {
  const rid = requestId();
  if (c.env.MENTOR_ENABLED === "0") {
    const { body, status } = fail("MENTOR_DISABLED", "Встроенный режим выключен", 503, rid);
    return c.json(body, status as 503);
  }

  const fileId = String(c.req.param("id") ?? "").trim().toLowerCase();
  const userId = String(c.req.query("user_id") ?? "").trim().toLowerCase();
  if (!isUuid(fileId) || !isUuid(userId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный файл или пользователь", 422, rid);
    return c.json(body, status as 422);
  }

  const signed = await verifyDocumentRequest(
    c.env,
    fileId,
    userId,
    c.req.header(BRIDGE_TIMESTAMP_HEADER),
    c.req.header(BRIDGE_SIGNATURE_HEADER),
  );
  if (!signed) {
    const { body, status } = fail("UNAUTHORIZED", "Подпись бриджа не принята", 401, rid);
    return c.json(body, status as 401);
  }

  const limit = await rateLimit(c.env, `bridge:content:${userId}`, 120, 60);
  if (!limit.allowed) {
    const { body, status } = fail("RATE_LIMITED", "Слишком много чтений файла", 429, rid);
    return c.json(body, status as 429);
  }

  // Права проверяются заново: отзыв группы действует со следующего чтения.
  const access = await loadAccessibleFile(c.env, fileId, userId);
  if ("failure" in access) {
    await auditRead(c.env, {
      fileId,
      userId,
      outcome: access.failure.status === 403 ? "forbidden" : access.failure.status === 404 ? "not_found" : "error",
    });
    const { body, status } = fail(access.failure.code, access.failure.message, access.failure.status, rid);
    return c.json(body, status as 403 | 404 | 503);
  }

  const bucket = getStorageBackend(c.env);
  if (!bucket) {
    await auditRead(c.env, { fileId, userId, outcome: "error" });
    const { body, status } = fail("STORAGE_NOT_CONFIGURED", "Файловое хранилище не настроено", 503, rid);
    return c.json(body, status as 503);
  }

  const key = String(access.file.object_key || "");
  try {
    const object = await bucket.get(key);
    await auditRead(c.env, { fileId, userId, outcome: "allowed", bytes: object.body.byteLength });
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.contentType || access.file.mime_type || "application/octet-stream",
        "Content-Length": String(object.body.byteLength),
        "Cache-Control": "private, no-store",
        "X-Bridge-File-Id": fileId,
      },
    });
  } catch (error) {
    console.error("[bridge:documents:content]", String(error));
    await auditRead(c.env, { fileId, userId, outcome: "error" });
    const { body, status } = fail("STORAGE_ERROR", "Не удалось прочитать файл", 502, rid);
    return c.json(body, status as 502);
  }
});

export default documents;
