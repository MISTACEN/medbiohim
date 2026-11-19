import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";

import { UUID, subjectNames, loadCards, summarize, countNewQuestions } from "./shared";

import type { SrsRouter } from "./types";

export function registerSummaryRoutes(srs: SrsRouter) {
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
}
