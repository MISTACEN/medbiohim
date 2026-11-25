import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { getStorageBackend } from "../../lib/b2";

import type { TrainersRouter } from "./types";

/**
 * «Свои препараты»: личные карточки микропрепаратов.
 *
 * Строки живут в public.user_preparations с RLS по владельцу, поэтому запись и
 * удаление идут клиентом пользователя — сервер не может записать карточку
 * другому аккаунту. Service-клиент нужен только для подписи ссылки на фото из
 * public.files (файл обязан принадлежать тому же пользователю).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_SLUG = /^[a-z0-9_-]{1,64}$/;
const FIELDS = "id,subject_slug,name,organ,stain,description,image_url,file_id,created_at";

/** Сколько карточек подписываем за один запрос: подпись B2 не бесплатная. */
const MAX_SIGNED = 60;

function text(value: unknown, max: number): string | null {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

function longText(value: unknown): string | null {
  const clean = String(value ?? "").trim();
  return clean ? clean.slice(0, 4000) : null;
}

/** Разрешены https-ссылки и локальная статика; javascript:/data: — нет. */
function imageUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 1024);
  if (/^https:\/\/[^\s]+$/i.test(raw)) return raw.slice(0, 1024);
  return null;
}

type MineRow = {
  id: string;
  subject_slug: string;
  name: string;
  organ: string | null;
  stain: string | null;
  description: string | null;
  image_url: string | null;
  file_id: string | null;
  created_at: string;
};

export function registerMineRoutes(trainers: TrainersRouter) {
  trainers.get("/feed/mine", requireAuth, async (c) => {
    const rid = requestId();
    const user = c.get("user");
    const supabase = c.get("supabase");
    const subject = String(c.req.query("subject") || "").trim();
    try {
      let query = supabase
        .from("user_preparations")
        .select(FIELDS)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (subject && SUBJECT_SLUG.test(subject)) query = query.eq("subject_slug", subject);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as MineRow[];

      // Подписанные ссылки на загруженные фото: ключ object_key живёт в files,
      // а карточка хранит только file_id, чтобы ссылка не протухала в БД.
      const keys = new Map<string, string>();
      const fileIds = rows.map((row) => row.file_id).filter((id): id is string => Boolean(id)).slice(0, MAX_SIGNED);
      const service = fileIds.length ? createServiceClient(c.env) : null;
      if (service) {
        const { data: files, error: filesError } = await service
          .from("files")
          .select("id,object_key,uploaded_by,status")
          .in("id", fileIds)
          .eq("uploaded_by", user.id);
        if (filesError) console.error("[trainers:mine:files]", filesError.message);
        for (const file of files || []) {
          const key = typeof file.object_key === "string" ? file.object_key.trim() : "";
          if (key && file.status === "active") keys.set(String(file.id), key);
        }
      }
      const backend = keys.size ? getStorageBackend(c.env) : null;

      const items = await Promise.all(rows.map(async (row) => {
        let image = imageUrl(row.image_url);
        let expiresAt: string | null = null;
        const key = row.file_id ? keys.get(row.file_id) : "";
        if (!image && key && backend) {
          try {
            const signed = await backend.signedReadUrl(key);
            image = signed.url;
            expiresAt = signed.expiresAt;
          } catch (signError) {
            console.warn("[trainers:mine:sign]", String(signError));
          }
        }
        return {
          id: row.id,
          subject_slug: row.subject_slug,
          name: row.name,
          organ: row.organ,
          stain: row.stain,
          description: row.description,
          image,
          image_expires_at: expiresAt,
          created_at: row.created_at,
        };
      }));

      return c.json(ok({ items, count: items.length }, rid));
    } catch (error) {
      console.error("[trainers:mine:list]", error);
      const { body, status } = fail("DB_UNAVAILABLE", "Свои препараты недоступны", 503, rid);
      return c.json(body, status as 503);
    }
  });

  trainers.post("/feed/mine", requireAuth, async (c) => {
    const rid = requestId();
    const user = c.get("user");
    const supabase = c.get("supabase");
    let payload: Record<string, unknown> = {};
    try {
      payload = await c.req.json();
    } catch {
      const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
      return c.json(body, status as 400);
    }
    const name = text(payload.name, 160);
    if (!name || name.length < 2) {
      const { body, status } = fail("VALIDATION_ERROR", "Укажите название препарата", 422, rid);
      return c.json(body, status as 422);
    }
    const subjectSlug = text(payload.subject_slug, 64) || "histology";
    if (!SUBJECT_SLUG.test(subjectSlug)) {
      const { body, status } = fail("VALIDATION_ERROR", "Некорректный предмет", 422, rid);
      return c.json(body, status as 422);
    }

    // Файл можно приложить только свой: чужой file_id превратился бы в чтение
    // чужого объекта через подписанную ссылку.
    const fileId = text(payload.file_id, 64);
    if (fileId) {
      if (!UUID.test(fileId)) {
        const { body, status } = fail("VALIDATION_ERROR", "Некорректный file_id", 422, rid);
        return c.json(body, status as 422);
      }
      const service = createServiceClient(c.env);
      if (!service) {
        const { body, status } = fail("DB_UNAVAILABLE", "Хранилище недоступно", 503, rid);
        return c.json(body, status as 503);
      }
      const { data: file, error: fileError } = await service
        .from("files")
        .select("id,uploaded_by,mime_type,status")
        .eq("id", fileId)
        .eq("uploaded_by", user.id)
        .maybeSingle();
      if (fileError || !file || file.status !== "active" || !String(file.mime_type || "").startsWith("image/")) {
        const { body, status } = fail("VALIDATION_ERROR", "Фото не найдено в ваших файлах", 422, rid);
        return c.json(body, status as 422);
      }
    }

    try {
      const { data, error } = await supabase
        .from("user_preparations")
        .insert({
          user_id: user.id,
          subject_slug: subjectSlug,
          name,
          organ: text(payload.organ, 160),
          stain: text(payload.stain, 160),
          description: longText(payload.description),
          image_url: imageUrl(payload.image_url),
          file_id: fileId,
        })
        .select(FIELDS)
        .single();
      if (error) throw error;
      return c.json(ok({ item: data }, rid), 201);
    } catch (error) {
      console.error("[trainers:mine:create]", error);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить препарат", 503, rid);
      return c.json(body, status as 503);
    }
  });

  trainers.delete("/feed/mine/:id{[0-9a-fA-F-]{36}}", requireAuth, async (c) => {
    const rid = requestId();
    const user = c.get("user");
    const supabase = c.get("supabase");
    try {
      const { data, error } = await supabase
        .from("user_preparations")
        .delete()
        .eq("id", c.req.param("id"))
        .eq("user_id", user.id)
        .select("id");
      if (error) throw error;
      if (!data || !data.length) {
        const { body, status } = fail("NOT_FOUND", "Препарат не найден", 404, rid);
        return c.json(body, status as 404);
      }
      return c.json(ok({ deleted: true }, rid));
    } catch (error) {
      console.error("[trainers:mine:delete]", error);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить препарат", 503, rid);
      return c.json(body, status as 503);
    }
  });
}
