/**
 * Создание карточки препарата админом.
 *
 * До этой ручки база пополнялась только SQL-сидом: редактор
 * `/admin/trainer-cards` умел менять существующие карточки, но не заводить
 * новые. Теперь админ загружает снимок, заполняет название/орган/окраску,
 * выбирает методичку — и карточка сразу попадает в атлас (а с методичкой ещё
 * и в тренажёр, потому что появляются варианты ответа).
 *
 * Снимок: файл из `/files/upload` (B2) либо публичная https-ссылка. Для файла
 * карточка хранит `preparation.fileId`, и `/feed/:id/image` отдаёт байты сам.
 */
import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { safeObjectKey } from "../trainers/shared";
import { STRICT_ADMINS, UUID, bodyJson, error, gate, type AdminApp } from "./shared";
import { buildIdentifyQuestion } from "./preparation-options";

const SUBJECT = /^[a-z0-9_-]{1,64}$/;
const MODES = new Set(["preparation", "electronogram"]);
const MAX_TEXT = 2000;

function text(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function cardId(): string {
  return `feed-admin-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function registerTrainerCardCreate(admin: AdminApp) {
  admin.post("/trainer-cards", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;

    const input = (await bodyJson(c)) as Record<string, unknown> | null;
    if (!input || typeof input !== "object") return error(c, rid, 422, "VALIDATION_ERROR", "Нужно тело запроса");

    const name = text(input.name, 160);
    if (name.length < 2) return error(c, rid, 422, "VALIDATION_ERROR", "Название препарата — хотя бы два символа");

    const subject = text(input.subject_slug, 64) || "histology";
    if (!SUBJECT.test(subject)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный предмет");
    const modeSet = MODES.has(text(input.mode_set, 32)) ? text(input.mode_set, 32) : "preparation";

    const service = createServiceClient(c.env);
    if (!service) return error(c, rid, 503, "DB_UNAVAILABLE", "База недоступна");

    // Источник снимка: свой файл в хранилище либо внешняя https-ссылка.
    const fileId = text(input.file_id, 64);
    const externalUrl = text(input.external_url, 2000);
    let objectKey = "";
    if (fileId) {
      if (!UUID.test(fileId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный file_id");
      const { data: file, error: fileError } = await service
        .from("files")
        .select("object_key,status,mime_type")
        .eq("id", fileId)
        .maybeSingle();
      if (fileError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось прочитать файл");
      objectKey = safeObjectKey(String(file?.object_key || ""));
      if (!objectKey || file?.status !== "active") {
        return error(c, rid, 422, "VALIDATION_ERROR", "Файл удалён или недоступен");
      }
      if (!String(file?.mime_type || "").startsWith("image/")) {
        return error(c, rid, 422, "VALIDATION_ERROR", "Файл не является изображением");
      }
    } else if (externalUrl) {
      if (!/^https:\/\/[^\s]+$/i.test(externalUrl)) {
        return error(c, rid, 422, "VALIDATION_ERROR", "Ссылка должна начинаться с https://");
      }
    } else {
      return error(c, rid, 422, "VALIDATION_ERROR", "Добавьте снимок: файл или https-ссылку");
    }

    // Методичка даёт вопрос и варианты — без неё карточка только в атласе.
    let question: Record<string, unknown> = {};
    const guideKey = text(input.guide_key, 80);
    if (guideKey) {
      const built = await buildIdentifyQuestion(service, guideKey);
      if ("message" in built) return error(c, rid, 422, "VALIDATION_ERROR", built.message);
      question = built.question;
    }

    const captions = Array.isArray(input.captions)
      ? input.captions.map((item) => text(item, 200)).filter(Boolean).slice(0, 30)
      : [];
    const tags = Array.isArray(input.tags)
      ? input.tags.map((item) => text(item, 40)).filter(Boolean).slice(0, 8)
      : [];

    const preparation: Record<string, unknown> = {
      name,
      organ: text(input.organ, 160),
      stain: text(input.stain, 160),
      description: text(input.description, MAX_TEXT),
      contributor: "admin",
      ...(objectKey ? { imagePath: objectKey, fileId } : { imageUrl: externalUrl }),
      ...(captions.length ? { captions } : {}),
    };

    const id = cardId();
    const { data, error: insertError } = await service
      .from("trainer_feed_cards")
      .insert({
        id,
        subject_slug: subject,
        specialty_slug: text(input.specialty_slug, 50) || "mbh",
        mode_set: modeSet,
        preparation,
        question,
        hotspots: [],
        tags,
        is_published: input.is_published !== false,
        is_archived: false,
        source_file_id: fileId || null,
      })
      .select("id,preparation,mode_set,is_published,is_archived,subject_slug,updated_at")
      .single();
    if (insertError) {
      console.error("[admin:trainer-cards:create]", insertError.message);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать карточку");
    }

    // Внешняя ссылка дополнительно живёт как изображение карточки — её читает
    // маршрут `/feed/:id/images/:imageId`. Файл B2 отдаётся основным маршрутом.
    if (externalUrl) {
      const { error: imageError } = await service.from("trainer_card_images").insert({
        card_id: id,
        external_url: externalUrl,
        caption: name,
        sort_order: 0,
      });
      if (imageError) console.warn("[admin:trainer-cards:create:image]", imageError.message);
    }

    return c.json(
      ok(
        {
          item: {
            id,
            name,
            organ: preparation.organ,
            stain: preparation.stain,
            mode_set: modeSet,
            subject_slug: data.subject_slug,
            is_published: data.is_published !== false,
            is_archived: false,
            trainable: Boolean(guideKey),
          },
        },
        rid,
      ),
      201,
    );
  });
}
