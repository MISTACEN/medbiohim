import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const favorites = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["question", "material", "topic", "test", "subject", "module"]);

/** Пакетно подтягивает названия и ссылки целей: страница закладок без N+1. */
async function hydrateFavorites(db: any, items: any[]): Promise<any[]> {
  const idsByType = new Map<string, string[]>();
  for (const row of items) {
    const list = idsByType.get(row.target_type) || [];
    if (UUID.test(String(row.target_id))) list.push(String(row.target_id));
    idsByType.set(row.target_type, list);
  }
  const info = new Map<string, { title: string | null; href: string | null }>();
  const put = (type: string, id: string, title: string | null, href: string | null) =>
    info.set(`${type}:${id}`, { title, href });

  try {
    if (idsByType.get("question")?.length) {
      const { data } = await db.from("questions").select("id,text,subject_id").in("id", idsByType.get("question")!).limit(500);
      for (const q of data || [])
        put("question", q.id, String(q.text || "").slice(0, 140) || null, q.subject_id ? `/practice?subject_id=${q.subject_id}` : "/practice");
    }
    if (idsByType.get("material")?.length) {
      const { data } = await db.from("materials").select("id,title,subject_id").in("id", idsByType.get("material")!).limit(500);
      for (const m of data || [])
        put("material", m.id, m.title || null, m.subject_id ? `/subjects/${m.subject_id}?tab=materials` : "/materials");
    }
    if (idsByType.get("test")?.length) {
      const { data } = await db.from("tests").select("id,title,subject_id").in("id", idsByType.get("test")!).limit(500);
      for (const t of data || [])
        put("test", t.id, t.title || null, t.subject_id ? `/subjects/${t.subject_id}?tab=tests` : "/tests");
    }
    if (idsByType.get("subject")?.length) {
      const { data } = await db.from("subjects").select("id,name,slug").in("id", idsByType.get("subject")!).limit(500);
      for (const s of data || []) put("subject", s.id, s.name || null, `/subjects/${s.slug || s.id}`);
    }
    if (idsByType.get("module")?.length) {
      const { data } = await db.from("modules").select("id,title,subject_id").in("id", idsByType.get("module")!).limit(500);
      for (const m of data || []) put("module", m.id, m.title || null, m.subject_id ? `/subjects/${m.subject_id}?tab=plan` : null);
    }
    if (idsByType.get("topic")?.length) {
      const { data: topics } = await db.from("topics").select("id,title,module_id").in("id", idsByType.get("topic")!).limit(500);
      const moduleIds = Array.from(new Set((topics || []).map((t: any) => String(t.module_id)).filter(Boolean)));
      const subjectByModule = new Map<string, string>();
      if (moduleIds.length) {
        const { data: mods } = await db.from("modules").select("id,subject_id").in("id", moduleIds).limit(500);
        for (const m of mods || []) subjectByModule.set(String(m.id), String(m.subject_id));
      }
      for (const t of topics || []) {
        const subjectId = subjectByModule.get(String(t.module_id));
        put("topic", t.id, t.title || null, subjectId ? `/subjects/${subjectId}?tab=plan` : null);
      }
    }
  } catch (hydrateError) {
    // Гидрация — украшение: сами закладки отдаём даже при сбое названий.
    console.error("[favorites:hydrate]", hydrateError);
  }

  return items.map((row) => {
    const hit = info.get(`${row.target_type}:${row.target_id}`);
    return {
      ...row,
      title: hit?.title ?? null,
      href: hit?.href ?? null,
      // Цель больше не существует — честно помечаем, а не прячем.
      missing: !hit,
    };
  });
}

favorites.get("/", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").from("favorites").select("target_type,target_id,created_at").order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return c.json(ok({ items: await hydrateFavorites(c.get("supabase"), data || []) }, rid));
  } catch (error) {
    console.error("[favorites:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить избранное", 503, rid);
    return c.json(body, status as 503);
  }
});

favorites.post("/toggle", requireAuth, async (c) => {
  const rid = requestId();
  let input: any;
  try { input = await c.req.json(); } catch { input = null; }
  const targetType = String(input?.target_type || "");
  const targetId = String(input?.target_id || "");
  if (!TYPES.has(targetType) || !UUID.test(targetId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите корректный тип и ID материала", 422, rid);
    return c.json(body, status as 422);
  }
  const db = c.get("supabase");
  try {
    const { data: existing, error: readError } = await db.from("favorites").select("target_id").eq("target_type", targetType).eq("target_id", targetId).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await db.from("favorites").delete().eq("target_type", targetType).eq("target_id", targetId);
      if (error) throw error;
      return c.json(ok({ favorited: false, target_type: targetType, target_id: targetId }, rid));
    }
    const { error } = await db.from("favorites").insert({ user_id: c.get("user").id, target_type: targetType, target_id: targetId });
    if (error) throw error;
    return c.json(ok({ favorited: true, target_type: targetType, target_id: targetId }, rid));
  } catch (error) {
    console.error("[favorites:toggle]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить избранное", 503, rid);
    return c.json(body, status as 503);
  }
});

export default favorites;
