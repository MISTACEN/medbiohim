/**
 * SRS (spaced repetition) — legacy contract restored.
 *
 * The frontend (`src/lib/features-api.ts`, `/cards`) has always used
 * `GET /srs/summary`, `POST /srs/ensure`, `GET/POST /srs/cards`,
 * `POST /srs/review` and `DELETE /srs/cards/:id`. Only `/srs` and
 * `/srs/due` existed on the Worker, so the deck page silently broke.
 * This module keeps those older paths working as aliases.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const srs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD_FIELDS =
  "id,user_id,source_type,source_id,front,back,subject_id,subject_slug,topic,ease,interval,reps,due_at,reviewed_at,created_at,updated_at";

type SrsRow = {
  id?: string;
  user_id?: string;
  source_type?: string | null;
  source_id?: string | null;
  front?: string | null;
  back?: string | null;
  subject_id?: string | null;
  subject_slug?: string | null;
  topic?: string | null;
  ease?: number | string | null;
  interval?: number | string | null;
  reps?: number | string | null;
  due_at?: string | null;
  reviewed_at?: string | null;
};

function toEpoch(value: unknown, fallback: number): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.round(parsed / 1000) : fallback;
}

function formatCard(row: SrsRow, subjectNames: Map<string, string>, now: number) {
  const subjectSlug = String(row.subject_slug || "");
  const subjectName = subjectNames.get(subjectSlug) || "";
  const dueAt = toEpoch(row.due_at, now);
  return {
    id: String(row.id || ""),
    front: String(row.front || ""),
    back: String(row.back || ""),
    subject: subjectName || subjectSlug,
    subject_slug: subjectSlug,
    topic: String(row.topic || ""),
    source: row.source_type === "personal" ? "personal" : "question",
    ease: Number(row.ease ?? 2.5),
    interval: Number(row.interval ?? 0),
    reps: Number(row.reps ?? 0),
    due_at: dueAt,
    due_in_hours: Math.round(((dueAt - now) / 3600) * 10) / 10,
    reviewed_at: row.reviewed_at || null,
  };
}

async function subjectNames(supabase: any): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const { data } = await supabase
      .from("subjects")
      .select("name,slug")
      .eq("is_active", true)
      .limit(500);
    for (const row of data || []) {
      const slug = String((row as any).slug || "");
      if (slug) names.set(slug, String((row as any).name || ""));
    }
  } catch {
    // Subject names are decorative; cards still render with the slug.
  }
  return names;
}

async function loadCards(supabase: any, userId: string, limit: number): Promise<SrsRow[]> {
  const { data, error } = await supabase
    .from("srs_cards")
    .select(CARD_FIELDS)
    .eq("user_id", userId)
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SrsRow[];
}

function filterCards(
  rows: SrsRow[],
  options: { subjectId?: string | null; subjectSlug?: string | null; scope?: string | null },
): SrsRow[] {
  const subjectId = String(options.subjectId || "");
  const subjectSlug = String(options.subjectSlug || "");
  const scope = String(options.scope || "");
  return rows.filter((row) => {
    const source = row.source_type === "personal" ? "personal" : "question";
    if (scope === "shared" && source !== "question") return false;
    if (scope === "personal" && source !== "personal") return false;
    if (subjectId) return String(row.subject_id || "") === subjectId;
    if (subjectSlug) return String(row.subject_slug || "") === subjectSlug;
    return true;
  });
}

function summarize(rows: SrsRow[], subjectNamesBySlug: Map<string, string>, newAvailable: number) {
  const now = Math.round(Date.now() / 1000);
  let due = 0;
  let learning = 0;
  const subjects = new Map<string, { subject: string; subject_slug: string; count: number }>();
  for (const row of rows) {
    if (toEpoch(row.due_at, now) <= now) due += 1;
    if (Number(row.reps ?? 0) > 0 && Number(row.interval ?? 0) < 2) learning += 1;
    const slug = String(row.subject_slug || "");
    if (!slug) continue;
    const entry = subjects.get(slug) || {
      subject: subjectNamesBySlug.get(slug) || slug,
      subject_slug: slug,
      count: 0,
    };
    entry.count += 1;
    subjects.set(slug, entry);
  }
  return {
    due,
    learning,
    total: rows.length,
    new_available: newAvailable,
    subjects: [...subjects.values()].sort((a, b) => b.count - a.count),
  };
}

async function countNewQuestions(supabase: any, cards: SrsRow[]): Promise<number> {
  const covered = new Set(
    cards.filter((row) => row.source_type === "question" && row.source_id).map((row) => String(row.source_id)),
  );
  try {
    const { data, error } = await supabase
      .from("questions")
      .select("id")
      .eq("is_published", true)
      .is("archived_at", null)
      .limit(2000);
    if (error) return 0;
    return (data || []).filter((row: any) => !covered.has(String(row.id))).length;
  } catch {
    return 0;
  }
}

srs.get("/summary", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const [cards, names] = await Promise.all([loadCards(supabase, user.id, 2000), subjectNames(supabase)]);
    const newAvailable = await countNewQuestions(supabase, cards);
    return c.json(ok(summarize(cards, names, newAvailable), rid));
  } catch (error) {
    console.error("[srs:summary]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Повторение временно недоступно", 503, rid);
    return c.json(body, status as 503);
  }
});

srs.post("/ensure", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const count = Math.max(1, Math.min(50, Number(payload?.count ?? 20) || 20));
  const subjectId = String(payload?.subject_id || "").trim();
  const subjectSlug = String(payload?.subject_slug || "").trim();
  try {
    const cards = await loadCards(supabase, user.id, 5000);
    const covered = new Set(
      cards.filter((row) => row.source_type === "question" && row.source_id).map((row) => String(row.source_id)),
    );

    let scopedSubjectId = UUID.test(subjectId) ? subjectId : "";
    if (!scopedSubjectId && subjectSlug) {
      const { data: subjects, error: subjectError } = await supabase
        .from("subjects")
        .select("id")
        .eq("slug", subjectSlug)
        .limit(1);
      if (subjectError) throw subjectError;
      scopedSubjectId = String(subjects?.[0]?.id || "");
      if (!scopedSubjectId) return c.json(ok({ added: 0, total: cards.length }, rid));
    }

    const subjectSlugs = new Map<string, string>();
    const { data: subjectRows } = await supabase.from("subjects").select("id,slug").limit(500);
    for (const row of subjectRows || []) {
      subjectSlugs.set(String((row as any).id || ""), String((row as any).slug || ""));
    }

    let query = supabase
      .from("questions")
      .select("id,text,answer,subject_id")
      .eq("is_published", true)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (scopedSubjectId) query = query.eq("subject_id", scopedSubjectId);
    const { data: questions, error: questionError } = await query;
    if (questionError) throw questionError;

    const rows: Record<string, unknown>[] = [];
    for (const question of questions || []) {
      if (rows.length >= count) break;
      const id = String((question as any).id || "");
      if (!id || covered.has(id)) continue;
      covered.add(id);
      rows.push({
        user_id: user.id,
        source_type: "question",
        source_id: id,
        front: String((question as any).text || ""),
        back: String((question as any).answer || ""),
        subject_id: (question as any).subject_id || null,
        subject_slug: subjectSlugs.get(String((question as any).subject_id || "")) || subjectSlug || null,
        topic: null,
        ease: 2.5,
        interval: 0,
        reps: 0,
        due_at: new Date().toISOString(),
      });
    }

    if (!rows.length) return c.json(ok({ added: 0, total: cards.length }, rid));
    const { error: insertError } = await supabase.from("srs_cards").insert(rows);
    if (insertError) throw insertError;
    return c.json(ok({ added: rows.length, total: cards.length + rows.length }, rid));
  } catch (error) {
    console.error("[srs:ensure]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось подготовить колоду", 503, rid);
    return c.json(body, status as 503);
  }
});

srs.get("/cards", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 100) || 100));
  const options = {
    subjectId: c.req.query("subject_id"),
    subjectSlug: c.req.query("subject_slug"),
    scope: c.req.query("scope"),
  };
  try {
    const names = await subjectNames(supabase);
    const now = Math.round(Date.now() / 1000);
    const rows = filterCards(await loadCards(supabase, user.id, 2000), options);
    const items = rows.slice(0, limit).map((row) => formatCard(row, names, now));
    return c.json(ok({ items, count: items.length }, rid));
  } catch (error) {
    console.error("[srs:cards]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

srs.post("/cards", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const front = String(payload?.front || "").trim();
  const back = String(payload?.back || "").trim();
  if (!front) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите лицевую сторону карточки", 422, rid);
    return c.json(body, status as 422);
  }
  let subjectId = String(payload?.subject_id || "").trim();
  const subjectSlug = String(payload?.subject_slug || "").trim();
  try {
    if (!UUID.test(subjectId) && subjectSlug) {
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id")
        .eq("slug", subjectSlug)
        .eq("is_active", true)
        .limit(1);
      subjectId = String(subjects?.[0]?.id || "");
    }
    const { data, error } = await supabase
      .from("srs_cards")
      .insert({
        user_id: user.id,
        source_type: "personal",
        front,
        back,
        subject_id: UUID.test(subjectId) ? subjectId : null,
        subject_slug: subjectSlug || null,
        topic: String(payload?.topic || "").trim() || null,
        ease: 2.5,
        interval: 0,
        reps: 0,
        due_at: new Date().toISOString(),
      })
      .select(CARD_FIELDS)
      .single();
    if (error) throw error;
    const names = await subjectNames(supabase);
    return c.json(ok({ card: formatCard(data as SrsRow, names, Math.round(Date.now() / 1000)) }, rid), 201);
  } catch (error) {
    console.error("[srs:add-card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось добавить карточку", 503, rid);
    return c.json(body, status as 503);
  }
});

async function reviewCard(c: any, cardId: string, rating: number) {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  if (!UUID.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID карточки", 422, rid);
    return c.json(body, status as 422);
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 4) {
    const { body, status } = fail("VALIDATION_ERROR", "Оценка должна быть от 1 до 4", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: current, error: readError } = await supabase
      .from("srs_cards")
      .select(CARD_FIELDS)
      .eq("id", cardId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }

    let ease = Number((current as SrsRow).ease ?? 2.5);
    let interval = Number((current as SrsRow).interval ?? 0);
    let reps = Number((current as SrsRow).reps ?? 0);
    if (rating === 1) {
      reps = 0;
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
    } else if (rating === 2) {
      reps += 1;
      interval = Math.max(1, Math.ceil(Math.max(1, interval) * 1.4));
      ease = Math.max(1.3, ease - 0.05);
    } else if (rating === 3) {
      reps += 1;
      interval = interval > 0 ? Math.max(1, Math.ceil(interval * ease)) : 1;
    } else {
      reps += 1;
      interval = interval > 0 ? Math.max(1, Math.ceil(interval * ease * 1.3)) : 2;
      ease = Math.min(3.2, ease + 0.15);
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + interval * 86400_000).toISOString();
    const { data: updated, error: writeError } = await supabase
      .from("srs_cards")
      .update({
        ease: Number(ease.toFixed(2)),
        interval,
        reps,
        due_at: dueAt,
        reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", cardId)
      .eq("user_id", user.id)
      .select(CARD_FIELDS)
      .maybeSingle();
    if (writeError) throw writeError;

    const [names, cards] = await Promise.all([subjectNames(supabase), loadCards(supabase, user.id, 2000)]);
    const newAvailable = await countNewQuestions(supabase, cards);
    return c.json(
      ok(
        {
          card: formatCard((updated || current) as SrsRow, names, Math.round(now.getTime() / 1000)),
          summary: summarize(cards, names, newAvailable),
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[srs:review]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить повтор", 503, rid);
    return c.json(body, status as 503);
  }
}

srs.post("/review", requireAuth, async (c) => {
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const cardId = String(payload?.card_id || payload?.id || "").trim();
  const rating = Number(payload?.rating ?? 0);
  return reviewCard(c, cardId, rating);
});

srs.delete("/cards/:id", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID карточки", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("srs_cards")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    if (!data || !data.length) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ deleted: true, id }, rid));
  } catch (error) {
    console.error("[srs:delete-card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить карточку", 503, rid);
    return c.json(body, status as 503);
  }
});

// Legacy aliases kept for older clients.
srs.post("/:id/review", requireAuth, async (c) => {
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const rating = Number(payload?.rating ?? payload?.quality ?? 3);
  return reviewCard(c, String(c.req.param("id") || ""), rating);
});

srs.get("/due", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const now = Math.round(Date.now() / 1000);
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit") || 20) || 20));
  try {
    const names = await subjectNames(supabase);
    const rows = filterCards(await loadCards(supabase, user.id, 2000), {
      subjectId: c.req.query("subject_id"),
      subjectSlug: c.req.query("subject_slug"),
      scope: c.req.query("scope"),
    }).filter((row) => toEpoch(row.due_at, now) <= now);
    const items = rows.slice(0, limit).map((row) => formatCard(row, names, now));
    return c.json(ok({ items, count: items.length }, rid));
  } catch (error) {
    console.error("[srs:due]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

srs.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const names = await subjectNames(supabase);
    const now = Math.round(Date.now() / 1000);
    const rows = await loadCards(supabase, user.id, 100);
    const items = rows.map((row) => formatCard(row, names, now));
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[srs:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default srs;
