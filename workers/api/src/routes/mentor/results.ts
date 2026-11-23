/**
 * Result Bridge: PdfMentor возвращает результаты обработки документа.
 *
 * PdfMentor получил файл через Document Bridge, обработал его и пушит обратно
 * найденные страницы, привязки фрагментов и маршрут обучения. Вызывается только
 * сервером PdfMentor, без пользовательской сессии — поэтому проверяется та же
 * HMAC-подпись, что и при чтении файла: она покрывает `file_id` и `user_id`,
 * значит подставить чужого пользователя нельзя.
 *
 * Почему ответ всегда 2xx (кроме ошибок подписи и хранилища): PdfMentor считает
 * `404/405` признаком «эндпоинт не реализован» и прекращает пушить результаты.
 * Поэтому неизвестный файл — это `200` с `stored: false`, а не `404`.
 *
 * Повторный пуш той же версии перезаписывает прошлую: версия документа —
 * неизменяемая величина, копить её копии незачем.
 */
import { Hono } from "hono";
import { fail, ok, requestId } from "../../lib/response";
import { rateLimit } from "../../lib/redis";
import { createServiceClient } from "../../lib/supabase";
import type { Env } from "../../env";
import {
  BRIDGE_SIGNATURE_HEADER,
  BRIDGE_TIMESTAMP_HEADER,
  documentBridgeCode,
  verifyBridgeSignature,
} from "./model";

const results = new Hono<{ Bindings: Env }>();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Пределы на размер пуша: один документ не должен раздувать строку в базе. */
const LIMITS = { pages: 2000, fragments: 5000, route: 200, text: 4000, title: 400 } as const;

type ResultPayload = {
  file_id?: unknown;
  user_id?: unknown;
  version?: unknown;
  pages?: unknown;
  fragments?: unknown;
  route?: unknown;
};

function isUuid(value: unknown): boolean {
  return UUID_PATTERN.test(String(value ?? "").trim());
}

function asArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function shortText(value: unknown, limit: number): string {
  return String(value ?? "").slice(0, limit);
}

/**
 * Оставляем только поля контракта: тело приходит из внешнего сервиса, и лишние
 * ключи в jsonb — это способ протащить данные, которые мы не проверяли.
 */
function normalizePages(raw: unknown): Array<{ index: number }> {
  return asArray(raw, LIMITS.pages)
    .map((item) => Number((item as { index?: unknown })?.index))
    .filter((index) => Number.isInteger(index) && index >= 0)
    .map((index) => ({ index }));
}

function normalizeFragments(raw: unknown): Array<{
  page_index: number;
  block_id: string;
  text: string;
  category: string;
}> {
  return asArray(raw, LIMITS.fragments)
    .map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      return {
        page_index: Number(entry.page_index),
        block_id: shortText(entry.block_id, 120),
        text: shortText(entry.text, LIMITS.text),
        category: shortText(entry.category, 60),
      };
    })
    .filter((entry) => Number.isInteger(entry.page_index) && entry.page_index >= 0);
}

function normalizeRoute(raw: unknown): Array<{
  ord: number;
  level: string;
  title: string;
  summary: string | null;
  est_minutes: number | null;
}> {
  return asArray(raw, LIMITS.route)
    .map((item, position) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const minutes = Number(entry.est_minutes);
      const ord = Number(entry.ord);
      return {
        ord: Number.isInteger(ord) ? ord : position,
        level: shortText(entry.level, 40),
        title: shortText(entry.title, LIMITS.title),
        summary: entry.summary == null ? null : shortText(entry.summary, LIMITS.text),
        est_minutes: Number.isFinite(minutes) ? minutes : null,
      };
    })
    .filter((entry) => entry.title.length > 0);
}

/** POST /mentor/results — принять результаты обработки внешнего документа. */
results.post("/results", async (c) => {
  const rid = requestId();
  if (c.env.MENTOR_ENABLED === "0") {
    const { body, status } = fail("MENTOR_DISABLED", "Встроенный режим выключен", 503, rid);
    return c.json(body, status as 503);
  }

  let payload: ResultPayload = {};
  try {
    payload = (await c.req.json()) as ResultPayload;
  } catch {
    payload = {};
  }

  const fileId = String(payload.file_id ?? "").trim().toLowerCase();
  const userId = String(payload.user_id ?? "").trim().toLowerCase();
  if (!isUuid(fileId) || !isUuid(userId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны file_id и user_id (uuid)", 422, rid);
    return c.json(body, status as 422);
  }

  const verification = await verifyBridgeSignature({
    secret: c.env.BRIDGE_SECRET,
    code: documentBridgeCode(fileId, userId),
    timestamp: c.req.header(BRIDGE_TIMESTAMP_HEADER),
    signature: c.req.header(BRIDGE_SIGNATURE_HEADER),
  });
  if (!verification.ok) {
    console.warn("[bridge:results] rejected", { requestId: rid, reason: verification.reason });
    const { body, status } = fail("UNAUTHORIZED", "Подпись бриджа не принята", 401, rid);
    return c.json(body, status as 401);
  }

  const limit = await rateLimit(c.env, `bridge:results:${userId}`, 120, 60);
  if (!limit.allowed) {
    const { body, status } = fail("RATE_LIMITED", "Слишком много пушей результатов", 429, rid);
    return c.json(body, status as 429);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body, status } = fail("DB_UNAVAILABLE", "Сервисный доступ к базе не настроен", 503, rid);
    return c.json(body, status as 503);
  }

  // Файл должен существовать и быть активным: результаты по удалённому файлу
  // хранить нечего, но 404 отдавать нельзя — PdfMentor поймёт это как «моста нет».
  const { data: file, error: fileError } = await service
    .from("files")
    .select("id,status")
    .eq("id", fileId)
    .maybeSingle();
  if (fileError) {
    console.error("[bridge:results:file]", fileError.message);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось проверить файл", 503, rid);
    return c.json(body, status as 503);
  }
  if (!file || String((file as { status?: string }).status) !== "active") {
    console.warn("[bridge:results] file missing", { requestId: rid, fileId });
    return c.json(
      ok({ accepted: true, stored: false, reason: "NOT_FOUND", version: null }, rid),
    );
  }

  const version = shortText(payload.version, 200);
  const pages = normalizePages(payload.pages);
  const fragments = normalizeFragments(payload.fragments);
  const route = normalizeRoute(payload.route);

  const { error: storeError } = await service.from("bridge_document_results").upsert(
    {
      file_id: fileId,
      user_id: userId,
      version,
      pages,
      fragments,
      route,
      received_at: new Date().toISOString(),
    },
    { onConflict: "file_id,user_id,version" },
  );
  if (storeError) {
    // 5xx PdfMentor повторяет из очереди — это и нужно при сбое базы.
    console.error("[bridge:results:store]", storeError.message);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить результаты", 503, rid);
    return c.json(body, status as 503);
  }

  console.log("[bridge:results] stored", {
    requestId: rid,
    fileId,
    version,
    pages: pages.length,
    fragments: fragments.length,
    route: route.length,
  });

  return c.json(
    ok(
      {
        accepted: true,
        stored: true,
        version,
        pages: pages.length,
        fragments: fragments.length,
        route: route.length,
      },
      rid,
    ),
  );
});

export default results;
