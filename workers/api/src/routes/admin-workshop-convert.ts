/**
 * Блок 1 бэклога: конвертация Workshop (kind=test_questions) → банк вопросов.
 *
 * Три шага модерации (кнопка «Сделать тестом» у админа/модератора):
 *   GET  /admin/workshop-questions/:itemId/draft   — черновик для предпросмотра
 *   POST /admin/workshop-questions/:itemId/convert — публикация в questions
 *   POST /admin/workshop-questions/:itemId/reject  — отклонение с пояснением
 *
 * Ручная сверка обязательна (Pass 26A): сервер не строит варианты из OCR сам.
 * Provenance: questions.source='workshop' + source_item_id → исходный элемент;
 * картинки вариантов — workshop_item_files.id в options[].image_file_id.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { draftQuestionsFromItem, validateConvertedQuestions } from "../lib/question-convert";

const adminConvert = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Только админы и модераторы: конвертация пишет в прод-банк вопросов. */
async function isModerator(c: any): Promise<boolean> {
  const db = c.get("supabase");
  const user = c.get("user");
  const { data, error } = await db.from("user_roles").select("roles(code)").eq("user_id", user.id).limit(25);
  if (error) return false;
  const codes: string[] = [];
  for (const row of data || []) {
    const roleRows = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
    for (const role of roleRows) {
      const code = String(role?.code || "").toLowerCase().trim();
      if (code) codes.push(code);
    }
  }
  return codes.some((code) => code === "admin" || code === "moderator");
}

async function loadConvertibleItem(c: any, itemId: string) {
  const db = c.get("supabase");
  const [{ data: item }, { data: files }, { data: questions }] = await Promise.all([
    db.from("workshop_items").select("id,title,kind,status,metadata,author_id,question_conversion_status,question_conversion_note").eq("id", itemId).maybeSingle(),
    db.from("workshop_item_files").select("id,file_id,original_name,mime_type").eq("item_id", itemId).order("position", { ascending: true }),
    db.from("workshop_item_questions").select("id,text,topic,position").eq("item_id", itemId).order("position", { ascending: true }),
  ]);
  return { item, files: files || [], questions: questions || [] };
}

adminConvert.get("/workshop-questions/:itemId/draft", requireAuth, async (c) => {
  const rid = requestId();
  const itemId = String(c.req.param("itemId") || "");
  if (!UUID.test(itemId)) return c.json(fail("VALIDATION_ERROR", "Некорректный ID элемента", 422, rid), 422 as 422);
  if (!(await isModerator(c))) return c.json(fail("FORBIDDEN", "Конвертация доступна модераторам и админам", 403, rid), 403 as 403);

  const { item, files, questions } = await loadConvertibleItem(c, itemId);
  if (!item || item.status === "deleted") return c.json(fail("NOT_FOUND", "Материал не найден", 404, rid), 404 as 404);
  if (item.kind !== "test_questions") {
    return c.json(fail("VALIDATION_ERROR", "Конвертировать можно только элементы с типом «Вопросы теста»", 422, rid), 422 as 422);
  }

  // OCR-текст мог лежать в metadata (unpdf/parsed) — сеем черновик из него тоже.
  const metadata = (item.metadata && typeof item.metadata === "object") ? item.metadata : {};
  const ocrText = String((metadata as any).ocr_text ?? (metadata as any).pdf_text ?? (metadata as any).text ?? "");

  return c.json(ok({
    item: {
      id: item.id,
      title: item.title,
      status: item.status,
      conversion_status: item.question_conversion_status ?? "none",
      conversion_note: item.question_conversion_note ?? null,
    },
    // Картинки-кандидаты для вариантов: только файлы этого элемента.
    files: files.map((file: any) => ({ id: file.id, name: file.original_name, mime: file.mime_type })),
    drafts: draftQuestionsFromItem({ questions, ocrText }),
  }, rid), 200 as 200);
});

adminConvert.post("/workshop-questions/:itemId/convert", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const itemId = String(c.req.param("itemId") || "");
  if (!UUID.test(itemId)) return c.json(fail("VALIDATION_ERROR", "Некорректный ID элемента", 422, rid), 422 as 422);
  if (!(await isModerator(c))) return c.json(fail("FORBIDDEN", "Конвертация доступна модераторам и админам", 403, rid), 403 as 403);

  let payload: any;
  try { payload = await c.req.json(); } catch { return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400 as 400); }

  const subjectId = String(payload?.subject_id || "");
  const topicId = payload?.topic_id ? String(payload.topic_id) : null;
  const moduleId = payload?.module_id ? String(payload.module_id) : null;
  if (!UUID.test(subjectId)) return c.json(fail("VALIDATION_ERROR", "Нужен корректный subject_id", 422, rid), 422 as 422);
  if (topicId && !UUID.test(topicId)) return c.json(fail("VALIDATION_ERROR", "Некорректный topic_id", 422, rid), 422 as 422);
  if (moduleId && !UUID.test(moduleId)) return c.json(fail("VALIDATION_ERROR", "Некорректный module_id", 422, rid), 422 as 422);

  const { item, files } = await loadConvertibleItem(c, itemId);
  if (!item || item.status === "deleted") return c.json(fail("NOT_FOUND", "Материал не найден", 404, rid), 404 as 404);
  if (item.kind !== "test_questions") {
    return c.json(fail("VALIDATION_ERROR", "Конвертировать можно только элементы с типом «Вопросы теста»", 422, rid), 422 as 422);
  }

  const allowedImages = new Set<string>((files || []).map((file: any) => String(file.id)));
  const validated = validateConvertedQuestions(payload?.questions, allowedImages);
  if (!validated.ok) {
    return c.json(fail("VALIDATION_ERROR", "Проверьте вопросы перед публикацией", 422, rid, { errors: validated.errors }), 422 as 422);
  }

  // Целостность связей: предмет/тема существуют?
  const { data: subject } = await db.from("subjects").select("id").eq("id", subjectId).maybeSingle();
  if (!subject) return c.json(fail("VALIDATION_ERROR", "Предмет не найден", 422, rid), 422 as 422);
  if (topicId) {
    const { data: topic } = await db.from("topics").select("id").eq("id", topicId).maybeSingle();
    if (!topic) return c.json(fail("VALIDATION_ERROR", "Тема не найдена", 422, rid), 422 as 422);
  }

  const rows = validated.questions.map((question) => ({
    text: question.text,
    // Закрытый вопрос: options jsonb с correct/image_file_id; открытый: answer.
    options: question.options.length ? question.options : null,
    answer: question.answer,
    subject_id: subjectId,
    ...(topicId ? { topic_id: topicId } : {}),
    ...(moduleId ? { module_id: moduleId } : {}),
    // question_type enum: mcq (закрытый с вариантами) | open (эталон-ответ).
    type: question.options.length ? "mcq" : "open",
    is_published: true,
    is_active: true,
    source: "workshop",
    source_item_id: itemId,
  }));

  const { error: insertError } = await db.from("questions").insert(rows);
  if (insertError) {
    console.error("[admin:workshop-convert]", { stage: "insert", code: insertError.code, requestId: rid });
    return c.json(fail("DB_ERROR", "Не удалось опубликовать вопросы", 503, rid), 503 as 503);
  }

  const { error: itemUpdateError } = await db
    .from("workshop_items")
    .update({
      question_conversion_status: "published",
      question_conversion_note: null,
      question_converted_at: new Date().toISOString(),
      question_converted_by: user.id,
    })
    .eq("id", itemId);
  if (itemUpdateError) console.error("[admin:workshop-convert]", { stage: "status", code: itemUpdateError.code, requestId: rid });

  return c.json(ok({ published: rows.length, item_id: itemId }, rid), 200 as 200);
});

adminConvert.post("/workshop-questions/:itemId/reject", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const itemId = String(c.req.param("itemId") || "");
  if (!UUID.test(itemId)) return c.json(fail("VALIDATION_ERROR", "Некорректный ID элемента", 422, rid), 422 as 422);
  if (!(await isModerator(c))) return c.json(fail("FORBIDDEN", "Конвертация доступна модераторам и админам", 403, rid), 403 as 403);

  let payload: any;
  try { payload = await c.req.json(); } catch { payload = {}; }
  const note = String(payload?.note || "").trim().slice(0, 500);
  if (!note) return c.json(fail("VALIDATION_ERROR", "Укажите причину отклонения", 422, rid), 422 as 422);

  const { data: item } = await db.from("workshop_items").select("id,kind,status").eq("id", itemId).maybeSingle();
  if (!item || item.status === "deleted") return c.json(fail("NOT_FOUND", "Материал не найден", 404, rid), 404 as 404);

  const { error: updateError } = await db
    .from("workshop_items")
    .update({ question_conversion_status: "rejected", question_conversion_note: note })
    .eq("id", itemId);
  if (updateError) {
    console.error("[admin:workshop-convert]", { stage: "reject", code: updateError.code, requestId: rid });
    return c.json(fail("DB_ERROR", "Не удалось сохранить статус отклонения", 503, rid), 503 as 503);
  }
  // Элемент остаётся в Workshop: отклонили не материал, а его конвертацию.
  return c.json(ok({ item_id: itemId, status: "rejected" }, rid), 200 as 200);
});

export default adminConvert;
