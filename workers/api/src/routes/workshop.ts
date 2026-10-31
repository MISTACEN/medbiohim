import { Hono } from "hono";
import { getStorageBackend } from "../lib/b2";
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import {
  defaultTitle,
  detectKind,
  normalizeTags,
  personalDataFlags,
  sortFilesForBatch,
  splitQuestions,
  suggestTags,
  type WorkshopKind,
} from "../lib/workshop";

/**
 * Workshop — общий пул студенческих материалов.
 *
 * Режим публикации хранится в workshop_settings: `open` публикует сразу,
 * `manual` отправляет материал в очередь модератора. Решение о правах всегда
 * принимает сервер; RLS в миграции — второй слой, а не единственный.
 */
const workshop = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF = ["moderator", "admin"];
const MAX_FILES = 30;
const MAX_QUESTIONS = 300;

function dbFor(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

async function rolesOf(c: any): Promise<string[]> {
  const { data, error } = await c.get("supabase")
    .from("user_roles").select("roles(code)").eq("user_id", c.get("user").id).limit(20);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "").toLowerCase();
  }).filter(Boolean);
}

async function isStaff(c: any): Promise<boolean> {
  try {
    const roles = await rolesOf(c);
    return roles.some((role) => STAFF.includes(role));
  } catch {
    return false;
  }
}

function error(c: any, rid: string, status: number, code: string, message: string, details?: unknown) {
  const { body, status: responseStatus } = fail(code, message, status, rid, details as any);
  return c.json(body, responseStatus as any);
}

async function readSettings(c: any): Promise<{ moderation_mode: "open" | "manual"; personal_data_warning: boolean }> {
  const { data } = await dbFor(c).from("workshop_settings").select("moderation_mode,personal_data_warning").eq("id", true).maybeSingle();
  return {
    moderation_mode: data?.moderation_mode === "manual" ? "manual" : "open",
    personal_data_warning: data?.personal_data_warning !== false,
  };
}

function mapItem(row: any, files: any[] = [], questions: any[] = []) {
  if (!row) return null;
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    personal_data_flags: Array.isArray(row.personal_data_flags) ? row.personal_data_flags : [],
    files: files.map((file) => ({
      id: file.id,
      file_id: file.file_id ?? null,
      name: file.original_name,
      mime: file.mime_type,
      size: Number(file.size_bytes || 0),
      position: Number(file.position || 0),
    })),
    questions: questions.map((question) => ({ id: question.id, text: question.text, topic: question.topic ?? null, options: question.options ?? null, answer: question.answer ?? null, position: question.position })),
  };
}

async function loadItem(c: any, id: string) {
  const db = dbFor(c);
  const [{ data: item }, { data: files }, { data: questions }] = await Promise.all([
    db.from("workshop_items").select("*").eq("id", id).maybeSingle(),
    db.from("workshop_item_files").select("*").eq("item_id", id).order("position", { ascending: true }),
    db.from("workshop_item_questions").select("*").eq("item_id", id).order("position", { ascending: true }),
  ]);
  return { item, files: files || [], questions: questions || [] };
}

function snapshotOf(item: any, files: any[], questions: any[]) {
  return {
    title: item.title,
    summary: item.summary,
    kind: item.kind,
    tags: item.tags,
    subject_id: item.subject_id,
    topic: item.topic,
    questions: questions.map((question) => ({ text: question.text, topic: question.topic, position: question.position })),
    files: files.map((file) => ({
      id: file.id,
      file_id: file.file_id,
      object_key: file.object_key,
      original_name: file.original_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      position: file.position,
    })),
  };
}

async function saveVersion(c: any, item: any, files: any[], questions: any[], actorId: string, note?: string, explicitVersion?: number) {
  const db = dbFor(c);
  const { data: latest } = await db.from("workshop_item_versions")
    .select("version_no").eq("item_id", item.id)
    .order("version_no", { ascending: false }).limit(1);
  const versionNo = explicitVersion ?? Math.max(Number(latest?.[0]?.version_no || 0), Number(item.version_no || 0)) + 1;
  const { error: insertError } = await db.from("workshop_item_versions").insert({
    item_id: item.id,
    version_no: versionNo,
    snapshot: snapshotOf(item, files, questions),
    note: note ? String(note).slice(0, 500) : null,
    created_by: actorId,
  });
  if (insertError) throw insertError;
  return versionNo;
}

async function notify(c: any, userId: string, title: string, body: string, href?: string, kind = "workshop") {
  try {
    await dbFor(c).from("notifications").insert({ user_id: userId, kind, title, body: body.slice(0, 1000), href: href || null });
  } catch (notificationError) {
    // Уведомление не должно отменять уже сохранённый материал.
    console.error("[workshop:notify]", notificationError);
  }
}

async function subjectSuggestions(c: any, text: string) {
  const db = dbFor(c);
  const { data } = await db.from("subjects").select("id,name,slug").eq("is_active", true).limit(200);
  const haystack = text.toLowerCase();
  return (data || [])
    .map((subject: any) => {
      const name = String(subject.name || "").toLowerCase();
      const slug = String(subject.slug || "").toLowerCase();
      const stem = name.replace(/(ия|ия|ая|ый|ий)$/u, "").slice(0, 6);
      const match = (name && haystack.includes(name)) || (slug && haystack.includes(slug)) || (stem.length >= 4 && haystack.includes(stem));
      return match ? { id: subject.id, name: subject.name, slug: subject.slug } : null;
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ id: string; name: string; slug: string }>;
}

/** Подсказки до загрузки: тип, название, теги и вероятный предмет. */
workshop.post("/suggest", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch { return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const files = Array.isArray(input.files) ? input.files.slice(0, MAX_FILES) : [];
  const fileNames = files.map((file: any) => String(file?.name || "")).filter(Boolean);
  const text = String(input.text || "");
  const hasQuestions = splitQuestions(text).length >= 2;
  const kind = detectKind(files.map((file: any) => ({ name: file?.name, mime: file?.mime, size: file?.size })), hasQuestions) as WorkshopKind;
  const subjects = await subjectSuggestions(c, [input.title, text, ...fileNames].filter(Boolean).join(" "));
  return c.json(ok({
    kind,
    title: defaultTitle(kind, subjects[0]?.name, input.topic, fileNames[0]),
    tags: suggestTags(kind, fileNames, normalizeTags(input.tags)),
    subjects,
    subjects_suggested: subjects,
    personal_data_flags: personalDataFlags({ title: input.title, text, fileNames }),
    batch_hint: kind === "photo_lecture" ? `Соберём ${files.length} фото в одну фотолекцию` : null,
    questions_detected: hasQuestions ? splitQuestions(text).length : 0,
  }, rid));
});

workshop.get("/settings", requireAuth, async (c) => {
  const rid = requestId();
  const settings = await readSettings(c);
  const staff = await isStaff(c);
  if (staff) {
    const { data } = await dbFor(c).from("workshop_settings").select("*").eq("id", true).maybeSingle();
    return c.json(ok({ ...settings, staff, updated_at: data?.updated_at ?? null }, rid));
  }
  return c.json(ok({ ...settings, staff }, rid));
});

workshop.patch("/settings", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  if (!roles.includes("admin")) return error(c, rid, 403, "FORBIDDEN", "Режим публикации меняет только администратор");
  let input: any = {};
  try { input = await c.req.json(); } catch { return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const patch: Record<string, unknown> = { updated_by: c.get("user").id, updated_at: new Date().toISOString() };
  if (input.moderation_mode !== undefined) {
    if (!["open", "manual"].includes(String(input.moderation_mode))) return error(c, rid, 422, "VALIDATION_ERROR", "Режим: open или manual");
    patch.moderation_mode = String(input.moderation_mode);
  }
  if (input.personal_data_warning !== undefined) patch.personal_data_warning = Boolean(input.personal_data_warning);
  const { data, error: writeError } = await dbFor(c).from("workshop_settings")
    .upsert({ id: true, ...patch }, { onConflict: "id" }).select("*").maybeSingle();
  if (writeError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить настройки");
  return c.json(ok({ settings: data }, rid));
});

workshop.get("/items", requireAuth, async (c) => {
  const rid = requestId();
  const db = dbFor(c);
  const user = c.get("user");
  const staff = await isStaff(c);
  const mine = ["1", "true", "yes"].includes(String(c.req.query("mine") || "").toLowerCase());
  const status = String(c.req.query("status") || "").trim();
  const subjectId = String(c.req.query("subject_id") || "").trim();
  const kind = String(c.req.query("kind") || "").trim();
  const tag = normalizeTags(c.req.query("tag"))[0] || "";
  const q = String(c.req.query("q") || "").trim().slice(0, 120);
  const limit = Math.max(1, Math.min(60, Number(c.req.query("limit") || 24)));
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  if (subjectId && !UUID.test(subjectId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_id");
  try {
    let query = db.from("workshop_items")
      .select("id,author_id,group_id,subject_id,topic,title,summary,kind,tags,status,version_no,report_count,downloads,created_at,updated_at,published_at", { count: "exact" })
      .neq("status", "deleted");
    if (mine) query = query.eq("author_id", user.id);
    else if (staff) {
      if (["pending", "hidden", "rejected", "draft"].includes(status)) query = query.eq("status", status);
      else query = query.in("status", ["published", "pending", "hidden"]);
    } else query = query.eq("status", "published");
    if (subjectId) query = query.eq("subject_id", subjectId);
    if (kind) query = query.eq("kind", kind);
    if (tag) query = query.contains("tags", [tag]);
    if (q) query = query.ilike("title", `%${q}%`);
    const { data, count, error: readError } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (readError) throw readError;
    const items = (data || []) as any[];
    const authorIds = [...new Set(items.map((item) => String(item.author_id || "")).filter(Boolean))];
    let authors: Record<string, string> = {};
    if (authorIds.length) {
      const { data: people } = await db.from("users").select("id,full_name,display_name").in("id", authorIds).limit(100);
      authors = Object.fromEntries((people || []).map((person: any) => [String(person.id), String(person.display_name || person.full_name || "Студент")]));
    }
    const subjectIds = [...new Set(items.map((item) => String(item.subject_id || "")).filter(Boolean))];
    let subjects: Record<string, string> = {};
    if (subjectIds.length) {
      const { data: rows } = await db.from("subjects").select("id,name").in("id", subjectIds).limit(100);
      subjects = Object.fromEntries((rows || []).map((row: any) => [String(row.id), String(row.name)]));
    }
    return c.json(ok({
      items: items.map((item) => ({
        ...item,
        tags: Array.isArray(item.tags) ? item.tags : [],
        author_name: authors[String(item.author_id)] || null,
        subject_name: subjects[String(item.subject_id)] || null,
      })),
      total: count ?? items.length,
      limit,
      offset,
      moderation_mode: (await readSettings(c)).moderation_mode,
    }, rid));
  } catch (readError) {
    console.error("[workshop:list]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Мастерская временно недоступна");
  }
});

workshop.get("/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const { item, files, questions } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  const staff = await isStaff(c);
  const isAuthor = String(item.author_id) === String(c.get("user").id);
  if (item.status !== "published" && !isAuthor && !staff) return error(c, rid, 403, "FORBIDDEN", "Материал ещё не опубликован");
  let authorName: string | null = null;
  let subjectName: string | null = null;
  if (item.author_id) {
    const { data: author } = await dbFor(c).from("users").select("full_name,display_name").eq("id", item.author_id).maybeSingle();
    authorName = String(author?.display_name || author?.full_name || "") || null;
  }
  if (item.subject_id) {
    const { data: subject } = await dbFor(c).from("subjects").select("name").eq("id", item.subject_id).maybeSingle();
    subjectName = String(subject?.name || "") || null;
  }
  return c.json(ok({ item: { ...mapItem(item, files, questions), author_name: authorName, subject_name: subjectName }, is_author: isAuthor, staff }, rid));
});

workshop.post("/items", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = dbFor(c);
  const staff = await isStaff(c);
  let input: any = {};
  try { input = await c.req.json(); } catch { return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const rawFiles = Array.isArray(input.files) ? input.files.slice(0, MAX_FILES) : [];
  if (!rawFiles.length && !String(input.question_text || "").trim() && !Array.isArray(input.questions)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Добавьте фото, PDF или список вопросов");
  }
  const fileIds = rawFiles.map((file: any) => String(file?.file_id || file?.id || "")).filter(Boolean);
  if (fileIds.some((id: string) => !UUID.test(id))) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный файл");
  let fileRows: any[] = [];
  if (fileIds.length) {
    const { data, error: fileError } = await db.from("files")
      .select("id,object_key,original_name,mime_type,size_bytes,uploaded_by,status")
      .in("id", fileIds).eq("status", "active").limit(MAX_FILES);
    if (fileError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось проверить файлы");
    fileRows = sortFilesForBatch((data || []) as any[]);
    if (fileRows.length !== new Set(fileIds).size) return error(c, rid, 422, "FILE_NOT_FOUND", "Часть файлов не найдена");
    if (!staff && fileRows.some((file) => String(file.uploaded_by) !== String(user.id))) {
      return error(c, rid, 403, "FORBIDDEN", "Можно прикреплять только свои загрузки");
    }
  }

  // ROLES-AND-MODULES «свои тесты»: вопрос может приходить структурно
  // (текст + варианты + эталон) — модератор потом сверяет при конвертации.
  // Строки (старый контракт) по-прежнему принимаются.
  const providedQuestions = (Array.isArray(input.questions)
    ? input.questions.map((question: any) =>
        typeof question === "string" || typeof question?.text !== "string"
          ? String(typeof question === "string" ? question : question?.text ?? "").trim()
          : String(question.text).trim()
      ).filter(Boolean)
    : splitQuestions(String(input.question_text || ""))).slice(0, MAX_QUESTIONS);
  const structuredQuestions: Array<{ text: string; options: unknown; answer: unknown }> = Array.isArray(input.questions)
    ? input.questions
        .filter((question: any) => question && typeof question === "object" && String(question?.text ?? "").trim())
        .map((question: any) => ({
          text: String(question.text).trim(),
          options: Array.isArray(question.options) ? question.options.slice(0, 8) : null,
          answer: question.answer != null ? String(question.answer).trim().slice(0, 500) : null,
        }))
        .slice(0, MAX_QUESTIONS)
    : [];
  let extractedQuestions = 0;
  let extractionError: string | null = null;
  // PDF с вопросами разбираем на отдельные вопросы. Текст без нумерации
  // остаётся одним материалом: лучше ничего не выдумать, чем нарезать абзацы.
  if (!providedQuestions.length && input.split_pdf_questions !== false) {
    const pdf = fileRows.find((file) => String(file.mime_type || "").includes("pdf") && Number(file.size_bytes || 0) <= 8 * 1024 * 1024);
    if (pdf) {
      try {
        // B2 (прод) → Upstash (fallback). Чтение напрямую через Upstash ломалось,
        // когда платформа переехала на B2.
        const backend = getStorageBackend(c.env);
        if (!backend) throw new Error("storage_not_configured");
        const object = await backend.get(String(pdf.object_key));
        const bytes = new Uint8Array(object.body);
        const document = await getDocumentProxy(bytes);
        const { text } = await extractText(document, { mergePages: true });
        const parsed = splitQuestions(String(text || "")).slice(0, MAX_QUESTIONS);
        if (parsed.length) { providedQuestions.push(...parsed); extractedQuestions = parsed.length; }
      } catch (pdfError) {
        extractionError = String(pdfError).slice(0, 200);
        console.error("[workshop:pdf-extract]", { error: extractionError, requestId: rid });
      }
    }
  }

  const scanText = [String(input.title || ""), String(input.summary || ""), String(input.question_text || ""), ...providedQuestions].join("\n");
  const flags = personalDataFlags({ title: input.title, text: scanText, fileNames: fileRows.map((file) => file.original_name) });
  if (flags.length && input.personal_data_confirmed !== true) {
    return error(c, rid, 422, "PERSONAL_DATA_CONFIRMATION_REQUIRED", "Возможны чужие персональные данные: подтвердите, что их нет или вы их вырезали", { flags });
  }

  const kind = ["photo_lecture", "notes", "test_questions", "pdf", "other"].includes(String(input.kind))
    ? String(input.kind) as WorkshopKind
    : detectKind(fileRows.map((file) => ({ name: file.original_name, mime: file.mime_type })), providedQuestions.length > 0);
  const tags = normalizeTags(input.tags?.length ? input.tags : suggestTags(kind, fileRows.map((file) => file.original_name)));
  let subjectId = input.subject_id ? String(input.subject_id) : null;
  if (subjectId && !UUID.test(subjectId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_id");
  if (!subjectId) {
    const suggestions = await subjectSuggestions(c, [input.title, ...tags, ...fileRows.map((file) => file.original_name)].filter(Boolean).join(" "));
    subjectId = suggestions[0]?.id ?? null;
  }
  const settings = await readSettings(c);
  const status = settings.moderation_mode === "manual" && !(input.status === "draft") ? "pending" : "published";
  const title = String(input.title || "").trim().slice(0, 160)
    || defaultTitle(kind, null, input.topic, fileRows[0]?.original_name);

  // Материал привязывается к учебной группе автора, чтобы староста мог
  // курировать материалы своей группы. Явный group_id принимается только
  // для группы, в которой автор действительно состоит.
  let groupId = input.group_id && UUID.test(String(input.group_id)) ? String(input.group_id) : null;
  const { data: membership } = await db.from("group_memberships")
    .select("group_id").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (groupId) {
    const { data: own } = await db.from("group_memberships")
      .select("group_id").eq("user_id", user.id).eq("group_id", groupId).eq("is_active", true).maybeSingle();
    if (!own && !staff) return error(c, rid, 403, "FORBIDDEN", "Материал можно привязать только к своей группе");
  } else {
    groupId = membership?.group_id ?? null;
  }

  const { data: item, error: insertError } = await db.from("workshop_items").insert({
    author_id: user.id,
    group_id: groupId,
    subject_id: subjectId,
    topic: input.topic ? String(input.topic).trim().slice(0, 200) : null,
    title,
    summary: input.summary ? String(input.summary).slice(0, 4000) : null,
    kind,
    tags,
    status,
    personal_data_confirmed: input.personal_data_confirmed === true,
    personal_data_flags: flags,
    version_no: 1,
    published_at: status === "published" ? new Date().toISOString() : null,
  }).select("*").maybeSingle();
  if (insertError || !item) {
    console.error("[workshop:create]", insertError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить материал");
  }

  const attached = fileRows.map((file, index) => ({
    item_id: item.id,
    file_id: file.id,
    object_key: String(file.object_key),
    original_name: String(file.original_name),
    mime_type: String(file.mime_type),
    size_bytes: Number(file.size_bytes || 0),
    position: index,
  }));
  if (attached.length) {
    const { data: fileWrite, error: fileWriteError } = await db.from("workshop_item_files").insert(attached).select("*");
    if (fileWriteError) console.error("[workshop:files]", fileWriteError);
    fileRows = fileWrite || attached;
  }
  const questionRows = providedQuestions.slice(0, MAX_QUESTIONS).map((text: string, index: number) => {
    const structured = structuredQuestions.find((question) => question.text === text);
    return {
      item_id: item.id,
      position: index,
      topic: input.topic ? String(input.topic).slice(0, 200) : null,
      text: text.slice(0, 20000),
      options: structured?.options ?? null,
      answer: structured?.answer ?? null,
    };
  });
  if (questionRows.length) {
    const { error: questionError } = await db.from("workshop_item_questions").insert(questionRows);
    if (questionError) console.error("[workshop:questions]", questionError);
  }
  try {
    await saveVersion(c, item, attached, questionRows, user.id, "Создание материала", 1);
  } catch (versionError) {
    console.error("[workshop:version]", versionError);
  }
  if (status === "pending") {
    const admins = await staffIds(c);
    for (const adminId of admins) {
      await notify(c, adminId, "Новый материал на проверке", title, `/admin/workshop`, "workshop_queue");
    }
  }
  return c.json(ok({
    item: mapItem(item, attached, questionRows),
    moderation_mode: settings.moderation_mode,
    personal_data_flags: flags,
    questions_extracted: extractedQuestions,
    extraction_error: extractionError,
  }, rid), 201);
});

async function staffIds(c: any): Promise<string[]> {
  try {
    const db = dbFor(c);
    const { data: roleRows } = await db.from("roles").select("id,code").in("code", STAFF);
    const ids = (roleRows || []).map((role: any) => role.id);
    if (!ids.length) return [];
    const { data: people } = await db.from("user_roles").select("user_id").in("role_id", ids).limit(500);
    const found: string[] = [...new Set<string>(((people || []) as any[]).map((row: any) => String(row.user_id)))];
    return found;
  } catch {
    return [];
  }
}

async function authorOrStaff(c: any, item: any): Promise<boolean> {
  return String(item?.author_id) === String(c.get("user").id) || await isStaff(c);
}

workshop.patch("/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const db = dbFor(c);
  const { item, files, questions } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Редактировать может только автор");
  let input: any = {};
  try { input = await c.req.json(); } catch { return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of ["title", "summary", "topic"] as const) {
    if (input[field] !== undefined) patch[field] = input[field] == null ? null : String(input[field]).slice(0, field === "summary" ? 4000 : 200);
  }
  if (input.title !== undefined && !String(patch.title || "").trim()) return error(c, rid, 422, "VALIDATION_ERROR", "Название не может быть пустым");
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.subject_id !== undefined) {
    if (input.subject_id && !UUID.test(String(input.subject_id))) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_id");
    patch.subject_id = input.subject_id || null;
  }
  if (input.kind !== undefined && ["photo_lecture", "notes", "test_questions", "pdf", "other"].includes(String(input.kind))) patch.kind = String(input.kind);
  const settings = await readSettings(c);
  // В ручном режиме правка опубликованного материала снова уходит на проверку.
  if (settings.moderation_mode === "manual" && item.status === "published" && !(await isStaff(c))) {
    patch.status = "pending";
    patch.published_at = null;
  }
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нечего обновлять");
  const { data: updated, error: updateError } = await db.from("workshop_items").update(patch).eq("id", id).select("*").maybeSingle();
  if (updateError || !updated) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить материал");
  const nextFiles = files;
  const nextQuestions = questions;
  let versionNo = Number(updated.version_no || 1) + 1;
  try {
    versionNo = await saveVersion(c, updated, nextFiles, nextQuestions, c.get("user").id, input.note ? String(input.note) : "Обновление материала");
    await db.from("workshop_items").update({ version_no: versionNo }).eq("id", id);
  } catch (versionError) {
    console.error("[workshop:version]", versionError);
  }
  return c.json(ok({ item: { ...mapItem({ ...updated, version_no: versionNo }, nextFiles, nextQuestions) }, moderation_mode: settings.moderation_mode }, rid));
});

workshop.post("/items/:id/visibility", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const hidden = input.hidden !== false;
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Скрывать может только автор");
  const patch: Record<string, unknown> = hidden
    ? {
        status: "hidden",
        previous_status: item.status === "hidden" ? item.previous_status : item.status,
        hidden_by: c.get("user").id,
        hidden_until: null,
        updated_at: new Date().toISOString(),
      }
    : {
        status: ["published", "pending", "rejected", "draft"].includes(String(item.previous_status)) ? item.previous_status : "pending",
        previous_status: null,
        hidden_by: null,
        hidden_until: null,
        published_at: item.previous_status === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
  const { data, error: updateError } = await db.from("workshop_items").update(patch).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить видимость");
  return c.json(ok({ item: data }, rid));
});

workshop.delete("/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Удалять может только автор");
  // Мягкое удаление: история версий и жалобы остаются для разбора.
  const { error: deleteError } = await dbFor(c).from("workshop_items")
    .update({ status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (deleteError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить материал");
  return c.json(ok({ deleted: true, id }, rid));
});

workshop.get("/items/:id/versions", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "История доступна автору и модераторам");
  const { data, error: readError } = await dbFor(c).from("workshop_item_versions")
    .select("id,version_no,note,created_by,created_at,snapshot").eq("item_id", id)
    .order("version_no", { ascending: false }).limit(50);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "История версий недоступна");
  return c.json(ok({
    items: (data || []).map((row: any) => ({
      id: row.id,
      version_no: row.version_no,
      note: row.note,
      created_at: row.created_at,
      title: row.snapshot?.title ?? null,
      files: Array.isArray(row.snapshot?.files) ? row.snapshot.files.length : 0,
      questions: Array.isArray(row.snapshot?.questions) ? row.snapshot.questions.length : 0,
    })),
    current_version: item.version_no,
  }, rid));
});

workshop.post("/items/:id/versions/:versionNo/restore", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  const versionNo = Number(c.req.param("versionNo"));
  if (!UUID.test(id) || !Number.isInteger(versionNo) || versionNo < 1) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректная версия");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Восстанавливать может только автор");
  const { data: version } = await db.from("workshop_item_versions")
    .select("snapshot").eq("item_id", id).eq("version_no", versionNo).maybeSingle();
  if (!version?.snapshot) return error(c, rid, 404, "VERSION_NOT_FOUND", "Версия не найдена");
  const snapshot = version.snapshot;
  await db.from("workshop_item_files").delete().eq("item_id", id);
  await db.from("workshop_item_questions").delete().eq("item_id", id);
  const files = Array.isArray(snapshot.files) ? snapshot.files : [];
  const questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
  if (files.length) await db.from("workshop_item_files").insert(files.map((file: any, index: number) => ({ ...file, item_id: id, position: index })));
  if (questions.length) await db.from("workshop_item_questions").insert(questions.map((question: any, index: number) => ({
    item_id: id,
    text: String(question.text || ""),
    topic: question.topic ?? null,
    options: Array.isArray(question.options) ? question.options.slice(0, 8) : question.options ?? null,
    answer: question.answer != null ? String(question.answer).slice(0, 500) : null,
    position: index,
  })));
  const { data: updated, error: updateError } = await db.from("workshop_items").update({
    title: snapshot.title ?? item.title,
    summary: snapshot.summary ?? null,
    kind: snapshot.kind ?? item.kind,
    tags: normalizeTags(snapshot.tags),
    subject_id: snapshot.subject_id ?? null,
    topic: snapshot.topic ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось восстановить версию");
  const next = await loadItem(c, id);
  let nextVersion = item.version_no;
  try {
    nextVersion = await saveVersion(c, updated, next.files, next.questions, c.get("user").id, `Восстановление версии ${versionNo}`);
    await db.from("workshop_items").update({ version_no: nextVersion }).eq("id", id);
  } catch {}
  return c.json(ok({ item: mapItem({ ...updated, version_no: nextVersion }, next.files, next.questions) }, rid));
});

workshop.post("/items/:id/report", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const reason = String(input.reason || "").trim().slice(0, 1000);
  if (reason.length < 3) return error(c, rid, 422, "VALIDATION_ERROR", "Опишите причину жалобы");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status !== "published") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  const { error: reportError } = await db.from("workshop_reports").insert({
    item_id: id, reporter_user_id: c.get("user").id, reason,
  });
  if (reportError) {
    if (String((reportError as any).code) === "23505") return error(c, rid, 409, "ALREADY_REPORTED", "Вы уже жаловались на этот материал");
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отправить жалобу");
  }
  await db.from("workshop_items").update({ report_count: Number(item.report_count || 0) + 1 }).eq("id", id);
  return c.json(ok({ reported: true }, rid), 201);
});

workshop.get("/items/:id/files/:fileId", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  const fileId = c.req.param("fileId") || "";
  if (!UUID.test(id) || !UUID.test(fileId)) return error(c, rid, 404, "NOT_FOUND", "Файл не найден");
  const backend = getStorageBackend(c.env);
  if (!backend) return error(c, rid, 503, "STORAGE_NOT_CONFIGURED", "Хранилище не настроено");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  const isAuthor = String(item.author_id) === String(c.get("user").id);
  if (item.status !== "published" && !isAuthor && !(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Материал ещё не опубликован");
  const { data: file } = await db.from("workshop_item_files").select("*")
    .eq("item_id", id).or(`id.eq.${fileId},file_id.eq.${fileId}`).maybeSingle();
  if (!file) return error(c, rid, 404, "NOT_FOUND", "Файл не найден");
  const key = String(file.object_key || "");
  if (!key.startsWith("users/")) return error(c, rid, 404, "NOT_FOUND", "Файл недоступен");
  try {
    const object = await backend.get(key);
    const headers = new Headers({
      "content-type": String(file.mime_type || object.contentType || "application/octet-stream"),
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(file.original_name || "file"))}`,
    });
    return new Response(object.body, { headers });
  } catch (blobError) {
    console.error("[workshop:file]", blobError);
    return error(c, rid, 502, "STORAGE_ERROR", "Не удалось открыть файл");
  }
});

workshop.get("/moderation/queue", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Очередь доступна модераторам");
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") || 50)));
  const { data, error: readError } = await dbFor(c).from("workshop_items")
    .select("id,author_id,subject_id,title,summary,kind,tags,status,report_count,personal_data_flags,created_at,version_no")
    .in("status", ["pending", "hidden"]).order("created_at", { ascending: true }).limit(limit);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Очередь недоступна");
  return c.json(ok({ items: data || [], moderation_mode: (await readSettings(c)).moderation_mode }, rid));
});

workshop.post("/moderation/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const action = String(input.action || "");
  if (!["approve", "reject", "hide", "unhide"].includes(action)) return error(c, rid, 422, "VALIDATION_ERROR", "Действие: approve, reject, hide или unhide");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  const staff = await isStaff(c);
  // Староста курирует материалы своей группы, но не публикует их на весь сайт.
  let starosta = false;
  if (!staff && item.group_id) {
    const { data: membership } = await db.from("group_memberships").select("role_in_group")
      .eq("group_id", item.group_id).eq("user_id", c.get("user").id).eq("is_active", true).maybeSingle();
    starosta = String(membership?.role_in_group || "") === "starosta";
  }
  if (!staff && (!starosta || !["hide", "unhide"].includes(action))) {
    return error(c, rid, 403, "FORBIDDEN", "Действие доступно модераторам");
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), moderation_note: input.note ? String(input.note).slice(0, 1000) : null };
  if (action === "approve") { patch.status = "published"; patch.previous_status = null; patch.published_at = new Date().toISOString(); patch.hidden_by = null; patch.hidden_until = null; }
  if (action === "reject") { patch.status = "rejected"; patch.previous_status = null; patch.published_at = null; }
  if (action === "hide") {
    // Запоминаем прежний статус: снятие скрытия не должно публиковать
    // материал, который ещё не прошёл модерацию.
    patch.previous_status = item.status === "hidden" ? item.previous_status : item.status;
    patch.status = "hidden";
    patch.hidden_by = c.get("user").id;
    patch.hidden_until = input.hidden_until ? String(input.hidden_until).slice(0, 40) : null;
  }
  if (action === "unhide") {
    patch.status = ["published", "pending", "rejected", "draft"].includes(String(item.previous_status)) ? item.previous_status : "pending";
    patch.previous_status = null;
    patch.hidden_by = null;
    patch.hidden_until = null;
  }
  const { data, error: updateError } = await db.from("workshop_items").update(patch).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить статус");
  const titles: Record<string, string> = {
    approve: "Материал опубликован",
    reject: "Материал отклонён",
    hide: "Материал скрыт модератором",
    unhide: "Материал снова опубликован",
  };
  await notify(c, String(item.author_id), titles[action], `${item.title}${input.note ? ` — ${String(input.note).slice(0, 300)}` : ""}`, "/workshop");
  return c.json(ok({ item: data }, rid));
});

workshop.get("/moderation/reports", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Жалобы доступны модераторам");
  const { data, error: readError } = await dbFor(c).from("workshop_reports")
    .select("id,item_id,reporter_user_id,reason,status,created_at,item:workshop_items(id,title,status,author_id)")
    .order("created_at", { ascending: false }).limit(100);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Жалобы недоступны");
  return c.json(ok({ items: data || [] }, rid));
});

workshop.patch("/moderation/reports/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Жалобы разбирают модераторы");
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const status = String(input.status || "");
  if (!["resolved", "dismissed"].includes(status)) return error(c, rid, 422, "VALIDATION_ERROR", "Статус: resolved или dismissed");
  const { data, error: updateError } = await dbFor(c).from("workshop_reports").update({
    status, resolved_by: c.get("user").id, resolved_at: new Date().toISOString(),
  }).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось закрыть жалобу");
  return c.json(ok({ report: data }, rid));
});

export default workshop;
