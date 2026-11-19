import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { aiDailyQuota, aiQuotaMessage, logAiCall, logAiQuotaRejection } from "../../lib/ai-usage";
import { requireContentOwnership } from "../../lib/content-access";
import { checkLectureForPublish, syncPublishedLecture } from "../../lib/lecture-quality";
import { CONTENT_MODERATORS, LECTURE_FIELDS, MANAGERS, bodyJson, error, gate, pick, validText, type AdminApp } from "./shared";

/**
 * Черновики, правка, публикация и отклонение платформенных лекций.
 */
export function registerLectures(admin: AdminApp) {

  // Lectures are stored in site_content.payload.items; keep the legacy JSON document contract.
  async function readLectures(db: any) {
    // maybeSingle() на дубликате ключа даёт PGRST116 → 503 (гипотеза D35).
    // Миграция 20261008_histology_lecture_05_blood.sql вставляет 'lectures'
    // беззащитным insert — берём последнюю обновлённую строку детерминированно.
    const { data: rows, error: dbError } = await db
      .from("site_content")
      .select("key,payload")
      .eq("key", "lectures")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (dbError) { console.error("[admin:lectures]", dbError.message); throw dbError; }
    const payload = rows?.[0]?.payload;
    return { exists: !!rows?.length, items: Array.isArray(payload?.items) ? payload.items : [] };
  }
  async function writeLectures(db: any, old: any, items: any[]) {
    const payload = { items };
    if (old.exists) {
      const { error: dbError } = await db.from("site_content").update({ payload, updated_at: new Date().toISOString() }).eq("key", "lectures");
      if (dbError) throw dbError;
    } else {
      const { error: dbError } = await db.from("site_content").insert({ key: "lectures", payload, updated_at: new Date().toISOString() });
      if (dbError) throw dbError;
    }
  }
  admin.get("/lectures", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase");
    // Редактор платформенных лекций — admin и moderator. На фронте он связан
    // только с админ-страницей /admin/lectures (план §8, §12).
    if (!await gate(c, CONTENT_MODERATORS)) return;
    const status = c.req.query("status") || "", subject = c.req.query("subject") || "";
    try {
      const store = await readLectures(db);
      let items = store.items;
      if (status) items = items.filter((x: any) => x.status === status);
      if (subject) items = items.filter((x: any) => x.subject_slug === subject);
      items = items.sort((a: any, b: any) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 500);
      return c.json(ok({ items, count: items.length }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить лекции"); }
  });
  admin.post("/lectures/generate", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), user = c.get("user"), input = await bodyJson(c);
    // AI-генерация лекций — платный внешний вызов: только admin и moderator.
    // Преподаватель не расходует платформенную квоту на чужой каталог.
    if (!await gate(c, CONTENT_MODERATORS)) return;
    const subjectSlug = String(input?.subject_slug || "").trim();
    const topic = String(input?.topic || "").trim();
    const notes = String(input?.notes || "").trim().slice(0, 12000);
    const imageUrl = String(input?.image_url || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(subjectSlug) || !validText(topic, 500)) return error(c, rid, 422, "VALIDATION_ERROR", "subject_slug и topic обязательны");
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) return error(c, rid, 422, "VALIDATION_ERROR", "image_url должен использовать HTTPS");
    const apiKey = String(c.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) return error(c, rid, 503, "AI_NOT_CONFIGURED", "Для генерации лекций настройте OPENAI_API_KEY в Cloudflare secrets");
    // Генерация целой лекции — самый дорогой ИИ-вызов платформы: суточная квота.
    const quota = await aiDailyQuota(c.env, "lecture_generate", user.id);
    if (!quota.allowed) {
      await logAiQuotaRejection(c.env, {
        route: "POST /admin/lectures/generate",
        feature: "lecture_generate",
        userId: user.id,
        subjectSlug,
        requestId: rid,
      });
      return error(c, rid, 429, "AI_DAILY_LIMIT", aiQuotaMessage(quota, "lecture_generate"));
    }
    const model = c.env.OPENAI_MODEL || "gpt-4o-mini";
    const startedAt = Date.now();
    const aiUsage = {
      route: "POST /admin/lectures/generate",
      feature: "lecture_generate" as const,
      userId: user.id,
      subjectSlug,
      requestId: rid,
      provider: "openai",
      model,
    };
    let generated: any;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Ты создаёшь проверяемый учебный черновик на русском языке. Не выдумывай источники и не выдавай сомнительные факты за достоверные. Верни JSON с ключами title, summary, body_md. body_md — структурированный Markdown с целями, основными разделами, кратким выводом и списком вопросов для самопроверки. Не включай HTML и внешние ссылки, если они не предоставлены." },
            { role: "user", content: JSON.stringify({ subject_slug: subjectSlug, topic, notes, image_url: imageUrl || null, task: "Сгенерируй черновик лекции для последующей проверки человеком." }) }
          ]
        }),
        signal: AbortSignal.timeout(25000)
      });
      const payload: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        await logAiCall(c.env, { ...aiUsage, outcome: "error", errorCode: "AI_HTTP_" + response.status, latencyMs: Date.now() - startedAt });
        return error(c, rid, 502, "AI_GENERATION_FAILED", "AI-провайдер не смог сгенерировать лекцию");
      }
      generated = JSON.parse(String(payload.choices?.[0]?.message?.content || "{}"));
      if (!validText(generated.title, 500) || !validText(generated.body_md, 40000)) throw new Error("invalid generated document");
      await logAiCall(c.env, { ...aiUsage, outcome: "ok", latencyMs: Date.now() - startedAt });
    } catch (generationError) {
      await logAiCall(c.env, {
        ...aiUsage,
        outcome: "error",
        errorCode: String((generationError as any)?.code || (generationError as any)?.name || "BAD_OUTPUT"),
        latencyMs: Date.now() - startedAt,
      });
      return error(c, rid, 502, "AI_GENERATION_FAILED", "Не удалось получить корректный черновик лекции");
    }
    try {
      const store = await readLectures(db), now = new Date().toISOString();
      const lecture = {
        id: "lec-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        title: String(generated.title).slice(0, 500), subject: subjectSlug, subject_slug: subjectSlug, topic,
        lesson_type: "lecture", summary: String(generated.summary || "").slice(0, 3000), body_md: String(generated.body_md).slice(0, 40000),
        body_html: "", media: imageUrl ? [{ type: "image", url: imageUrl }] : [], attachments: [], related_learning: { methodics: [], files: [], preparations: [], electronograms: [] },
        status: "pending_review", created_by: user.id, reviewed_by: null, published_at: null, created_at: now, updated_at: now
      };
      await writeLectures(db, store, [...store.items, lecture]);
      return c.json(ok({ lecture }, rid), 201);
    } catch {
      return error(c, rid, 503, "DB_ERROR", "Черновик создан, но не удалось сохранить лекцию");
    }
  });

  admin.patch("/lectures/:id", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), input = await bodyJson(c);
    if (!await gate(c)) return;
    const patch = pick(input, LECTURE_FIELDS);
    if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
    if (patch.title !== undefined && !validText(patch.title, 500)) return error(c, rid, 422, "VALIDATION_ERROR", "Название лекции обязательно");
    try {
      const store = await readLectures(db), index = store.items.findIndex((x: any) => String(x.id) === id);
      if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Лекция не найдена");
      // Преподаватель правит только свою лекцию и только до публикации:
      // опубликованный материал меняет модератор или администратор.
      if (!await requireContentOwnership(c, store.items[index].created_by, {
        published: store.items[index].status === "published",
      })) return c.res;
      const updated = { ...store.items[index], ...patch, updated_at: new Date().toISOString() };
      store.items[index] = updated;
      await writeLectures(db, store, store.items);
      return c.json(ok({ lecture: updated }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить лекцию"); }
  });
  admin.post("/lectures/:id/publish", requireAuth, async (c) => setLectureStatus(c, "published", ["admin", "moderator"]));
  admin.post("/lectures/:id/reject", requireAuth, async (c) => setLectureStatus(c, "rejected", ["admin", "moderator"]));
  async function setLectureStatus(c: any, status: string, roles: string[]) {
    const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), user = c.get("user");
    if (!await gate(c, roles)) return;
    try {
      const store = await readLectures(db), index = store.items.findIndex((x: any) => String(x.id) === id);
      if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Лекция не найдена");
      // Публикация проходит проверку на заглушку и дубль: каталог не засоряется.
      if (status === "published") {
        const issue = checkLectureForPublish(store.items[index], store.items.filter((x: any) => x.status === "published"));
        if (issue) return error(c, rid, 422, issue.code, issue.message);
      }
      const now = new Date().toISOString();
      store.items[index] = { ...store.items[index], status, reviewed_by: user.id, published_at: status === "published" ? now : null, updated_at: now };
      await writeLectures(db, store, store.items);
      // Публикация должна доходить до каталога студентов, снятие — убирать из него.
      const catalogSynced = await syncPublishedLecture(db, store.items[index], status === "published");
      return c.json(ok({ lecture: store.items[index], catalog_synced: catalogSynced }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось изменить статус лекции"); }
  }
  admin.delete("/lectures/:id", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
    if (!await gate(c, MANAGERS)) return;
    try {
      const store = await readLectures(db);
      const existing = store.items.find((x: any) => String(x.id) === id);
      if (!existing) return error(c, rid, 404, "NOT_FOUND", "Лекция не найдена");
      if (!await requireContentOwnership(c, existing.created_by, {
        published: existing.status === "published",
      })) return c.res;
      const items = store.items.filter((x: any) => String(x.id) !== id);
      await writeLectures(db, store, items);
      return c.json(ok({ deleted: true }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось удалить лекцию"); }
  });
}
