/**
 * Очередь «Свои препараты → атлас».
 *
 * Студент отправляет свою карточку (`user_preparations.submission_status =
 * 'pending'`), админ одобряет или отклоняет. Одобрение создаёт обычную строку
 * `trainer_feed_cards` и публикует её: карточка появляется в атласе гистологии
 * у всех и дальше живёт как обычная карточка препарата (изображения, подписи,
 * архив — редактор `/admin/trainer-cards`).
 *
 * Чтение — админ и модератор, решение — только админ и только service-ключом:
 * у клиента нет права писать `submission_status` (триггер в миграции
 * `20261127140000_user_preparation_submissions.sql`).
 */
import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { getStorageBackend } from "../../lib/b2";
import { safeObjectKey } from "../trainers/shared";
import { buildIdentifyQuestion } from "./preparation-options";
import { MANAGERS, STRICT_ADMINS, UUID, bodyJson, error, gate, type AdminApp } from "./shared";

const STATUSES = new Set(["pending", "approved", "rejected", "all"]);
const FIELDS =
  "id,user_id,subject_slug,name,organ,stain,description,image_url,file_id,submission_status,submitted_at,reviewed_at,moderation_note,published_card_id,created_at";
const MAX_ROWS = 100;
const MAX_TEXT = 400;

type SubmissionRow = {
  id: string;
  user_id: string;
  subject_slug: string;
  name: string;
  organ: string | null;
  stain: string | null;
  description: string | null;
  image_url: string | null;
  file_id: string | null;
  submission_status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  moderation_note: string | null;
  published_card_id: string | null;
  created_at: string;
};

function text(value: unknown, max = MAX_TEXT): string | null {
  const clean = String(value ?? "").trim();
  return clean ? clean.slice(0, max) : null;
}

/** Стабильный id карточки атласа из id личной карточки: повторное одобрение не плодит дубли. */
export function publishedCardId(preparationId: string): string {
  return `feed-user-${preparationId.replace(/-/g, "").slice(0, 20)}`;
}

type ImageSource = { objectKey: string; externalUrl: null } | { objectKey: null; externalUrl: string };

async function resolveImage(
  c: any,
  row: SubmissionRow,
): Promise<{ value: ImageSource } | { message: string }> {
  if (row.file_id) {
    const service = createServiceClient(c.env);
    if (!service) return { message: "Хранилище недоступно" };
    const { data: file, error: fileError } = await service
      .from("files")
      .select("object_key,status,mime_type")
      .eq("id", row.file_id)
      .maybeSingle();
    if (fileError) return { message: "Не удалось прочитать файл препарата" };
    const objectKey = safeObjectKey(String(file?.object_key || ""));
    if (!objectKey || file?.status !== "active") return { message: "Файл препарата удалён или недоступен" };
    if (!String(file?.mime_type || "").startsWith("image/")) return { message: "Файл препарата — не изображение" };
    return { value: { objectKey, externalUrl: null } };
  }
  const url = String(row.image_url || "").trim();
  if (/^https:\/\/[^\s]+$/i.test(url)) return { value: { objectKey: null, externalUrl: url } };
  return { message: "В карточке нет снимка, который можно опубликовать: загрузите фото файлом" };
}

export function registerPreparationSubmissions(admin: AdminApp) {
  /** Очередь: по умолчанию только ожидающие решения. */
  admin.get("/preparation-submissions", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, MANAGERS))) return;
    const status = String(c.req.query("status") || "pending");
    if (!STATUSES.has(status)) return error(c, rid, 422, "VALIDATION_ERROR", "Неизвестный статус очереди");

    const service = createServiceClient(c.env);
    if (!service) return error(c, rid, 503, "DB_UNAVAILABLE", "База недоступна для очереди модерации");

    const limit = Math.min(Math.max(Number(c.req.query("limit") || 50), 1), MAX_ROWS);
    let query = service.from("user_preparations").select(FIELDS).order("submitted_at", { ascending: false }).limit(limit);
    query = status === "all" ? query.neq("submission_status", "draft") : query.eq("submission_status", status);
    const { data, error: listError } = await query;
    if (listError) {
      console.error("[admin:submissions:list]", listError.message);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Очередь препаратов недоступна");
    }
    const rows = (data || []) as SubmissionRow[];

    // Авторы: имя и почта нужны модератору, чтобы спросить про снимок.
    const authors = new Map<string, { name: string | null; email: string | null }>();
    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    if (userIds.length) {
      const { data: people, error: peopleError } = await service
        .from("users")
        .select("id,display_name,full_name,email")
        .in("id", userIds);
      if (peopleError) console.warn("[admin:submissions:authors]", peopleError.message);
      for (const person of people || []) {
        const name = String(person.display_name || person.full_name || "").trim() || null;
        authors.set(String(person.id), { name, email: person.email ? String(person.email) : null });
      }
    }

    // Подписанные ссылки на фото: ключи в files, срок жизни — час.
    const fileIds = rows.map((row) => row.file_id).filter((id): id is string => Boolean(id));
    const keys = new Map<string, string>();
    if (fileIds.length) {
      const { data: files, error: filesError } = await service
        .from("files")
        .select("id,object_key,status")
        .in("id", fileIds);
      if (filesError) console.warn("[admin:submissions:files]", filesError.message);
      for (const file of files || []) {
        const key = safeObjectKey(String(file.object_key || ""));
        if (key && file.status === "active") keys.set(String(file.id), key);
      }
    }
    const backend = keys.size ? getStorageBackend(c.env) : null;

    const items = await Promise.all(rows.map(async (row) => {
      const author = authors.get(row.user_id) || { name: null, email: null };
      let image = /^https:\/\//i.test(String(row.image_url || "")) ? String(row.image_url) : null;
      const key = row.file_id ? keys.get(row.file_id) : "";
      if (!image && key && backend) {
        try {
          image = (await backend.signedReadUrl(key)).url;
        } catch (signError) {
          console.warn("[admin:submissions:sign]", String(signError));
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
        submission_status: row.submission_status,
        submitted_at: row.submitted_at,
        reviewed_at: row.reviewed_at,
        moderation_note: row.moderation_note,
        published_card_id: row.published_card_id,
        created_at: row.created_at,
        author,
      };
    }));

    return c.json(ok({ items, count: items.length, status }, rid));
  });

  /** Одобрение: публикует карточку в общем атласе. */
  admin.post("/preparation-submissions/:id/approve", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;
    const id = String(c.req.param("id"));
    if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный id заявки");

    const service = createServiceClient(c.env);
    if (!service) return error(c, rid, 503, "DB_UNAVAILABLE", "База недоступна");

    const body = await bodyJson(c);
    const { data: row, error: readError } = await service
      .from("user_preparations")
      .select(FIELDS)
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("[admin:submissions:read]", readError.message);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Заявка недоступна");
    }
    if (!row) return error(c, rid, 404, "NOT_FOUND", "Заявка не найдена");
    const submission = row as SubmissionRow;
    if (submission.submission_status === "approved") {
      return error(c, rid, 409, "CONFLICT", "Заявка уже одобрена");
    }
    if (submission.submission_status !== "pending") {
      return error(c, rid, 409, "CONFLICT", "Одобрить можно только заявку, отправленную в атлас");
    }

    const image = await resolveImage(c, submission);
    if ("message" in image) return error(c, rid, 422, "VALIDATION_ERROR", image.message);

    // Методичка превращает снимок в задание тренажёра: без неё карточка
    // остаётся только в атласе.
    const guideKey = text(body?.guide_key, 80) || "";
    let question: Record<string, unknown> = {};
    if (guideKey) {
      const built = await buildIdentifyQuestion(service, guideKey);
      if ("message" in built) return error(c, rid, 422, "VALIDATION_ERROR", built.message);
      question = built.question;
    }

    const name = text(body?.name, 160) || submission.name;
    const organ = text(body?.organ, 160) ?? submission.organ;
    const stain = text(body?.stain, 160) ?? submission.stain;
    const description = text(body?.description, 2000) ?? submission.description;
    const cardId = publishedCardId(submission.id);
    const preparation: Record<string, unknown> = {
      name,
      organ,
      stain,
      description,
      contributor: "student",
      ...(image.value.objectKey ? { imagePath: image.value.objectKey } : { imageUrl: image.value.externalUrl }),
      ...(submission.file_id ? { fileId: submission.file_id } : {}),
    };

    const { error: cardError } = await service.from("trainer_feed_cards").insert({
      id: cardId,
      subject_slug: submission.subject_slug || "histology",
      specialty_slug: "mbh",
      mode_set: "preparation",
      preparation,
      question,
      hotspots: [],
      tags: ["свои препараты"],
      is_published: true,
      is_archived: false,
      source_file_id: submission.file_id,
    });
    if (cardError) {
      console.error("[admin:submissions:card]", cardError.message);
      const duplicate = String(cardError.code || "") === "23505";
      return error(c, rid, duplicate ? 409 : 503, duplicate ? "CONFLICT" : "DB_UNAVAILABLE",
        duplicate ? "Карточка с таким id уже существует" : "Не удалось опубликовать карточку");
    }

    // Дополнительное изображение заводим только для внешней ссылки: маршрут
    // `/feed/:id/images/:imageId` читает Upstash Blob, а файл студента лежит в B2
    // и отдаётся основным `/feed/:id/image` по `preparation.fileId`.
    if (image.value.externalUrl) {
      const { error: imageError } = await service.from("trainer_card_images").insert({
        card_id: cardId,
        external_url: image.value.externalUrl,
        caption: name,
        sort_order: 0,
      });
      if (imageError) console.warn("[admin:submissions:image-row]", imageError.message);
    }

    const { data: updated, error: updateError } = await service
      .from("user_preparations")
      .update({
        submission_status: "approved",
        reviewed_at: new Date().toISOString(),
        moderation_note: text(body?.note, 500),
        published_card_id: cardId,
      })
      .eq("id", id)
      .select(FIELDS)
      .single();
    if (updateError) {
      console.error("[admin:submissions:approve]", updateError.message);
      await service.from("trainer_feed_cards").delete().eq("id", cardId);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить решение по заявке");
    }

    // Публикация видна и в Мастерской: один студенческий материал не должен
    // жить в двух несвязанных списках. Связь — тег `atlas:<id>`: не нужна новая
    // колонка, старые строки не ломаются.
    const { error: workshopError } = await service.from("workshop_items").insert({
      author_id: submission.user_id,
      title: name,
      summary: description || [organ, stain].filter(Boolean).join(" · ") || null,
      kind: "other",
      topic: submission.subject_slug || "histology",
      tags: [`atlas:${submission.id}`, "атлас", "микропрепарат"],
      status: "published",
      personal_data_confirmed: true,
      published_at: new Date().toISOString(),
    });
    if (workshopError) {
      // Карточка уже опубликована: сбой зеркала в Мастерскую не отменяет решение.
      console.warn("[admin:submissions:workshop]", workshopError.message);
    }

    return c.json(ok({ item: updated, card_id: cardId }, rid));
  });

  /** Отклонение: карточка остаётся личной, владелец видит пояснение. */
  admin.post("/preparation-submissions/:id/reject", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;
    const id = String(c.req.param("id"));
    if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный id заявки");

    const service = createServiceClient(c.env);
    if (!service) return error(c, rid, 503, "DB_UNAVAILABLE", "База недоступна");

    const body = await bodyJson(c);
    const note = text(body?.note, 500);
    if (!note) return error(c, rid, 422, "VALIDATION_ERROR", "Напишите, что исправить в заявке");

    const { data, error: updateError } = await service
      .from("user_preparations")
      .update({
        submission_status: "rejected",
        reviewed_at: new Date().toISOString(),
        moderation_note: note,
      })
      .eq("id", id)
      .eq("submission_status", "pending")
      .select(FIELDS)
      .maybeSingle();
    if (updateError) {
      console.error("[admin:submissions:reject]", updateError.message);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить решение по заявке");
    }
    if (!data) return error(c, rid, 409, "CONFLICT", "Заявка не найдена или уже рассмотрена");

    return c.json(ok({ item: data }, rid));
  });
}
