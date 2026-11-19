import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { STRICT_ADMINS, error, gate, type AdminApp } from "./shared";

/**
 * Сводка консоли, проверка целостности контента и редирект /admin → /admin/overview.
 */
export function registerOverview(admin: AdminApp) {
  admin.get("/", requireAuth, async (c) => {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(/\/?$/, "") + "/overview";
    return admin.fetch(new Request(url.toString(), c.req.raw), c.env);
  });

  admin.get("/overview", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase");
    // Сводка Admin-консоли — только администратор: преподаватель и модератор
    // работают в своих пространствах и не видят платформенные счётчики.
    if (!await gate(c, STRICT_ADMINS)) return;
    try {
      const [groups, subjects, tests, questions, scheduleEntries, site, announcements] = await Promise.all([
        db.from("groups").select("id", { count: "exact", head: true }).eq("is_active", true),
        db.from("subjects").select("id", { count: "exact", head: true }).eq("is_active", true),
        db.from("tests").select("id", { count: "exact", head: true }),
        db.from("questions").select("id", { count: "exact", head: true }),
        db.from("schedule_entries").select("id", { count: "exact", head: true }),
        db.from("site_content").select("key,payload").eq("key", "site").maybeSingle(),
        db.from("site_content").select("payload").eq("key", "announcements").maybeSingle()
      ]);
      if (groups.error || subjects.error || tests.error || questions.error) return error(c, rid, 503, "DB_UNAVAILABLE", "Центр управления временно недоступен");
      // Ключи совпадают с подписями дашборда: раньше плитки «Объявления» и «Занятия»
      // молчали, потому что во внешнем интерфейсе не было под такие имена данных.
      const announcementPayload = announcements.data?.payload;
      const counts = {
        groups: groups.count || 0,
        subjects: subjects.count || 0,
        tests: tests.count || 0,
        questions: questions.count || 0,
        schedule: scheduleEntries.count || 0,
        announcements: Array.isArray(announcementPayload) ? announcementPayload.length : 0,
      };
      // Дополнительные счётчики — best effort: из-за них сводка не должна падать.
      const partial = Boolean(scheduleEntries.error || announcements.error || site.error);
      return c.json(ok({ site: site.data?.payload || {}, counts, source: "supabase", partial }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_UNAVAILABLE", "Центр управления временно недоступен"); }
  });

  admin.get("/content/validate", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase");
    if (!await gate(c, STRICT_ADMINS)) return;
    try {
      const [tests, questions, links, exam] = await Promise.all([
        db.from("tests").select("id,title,is_published,archived_at").limit(1000),
        db.from("questions").select("id,is_published,archived_at").limit(5000),
        db.from("test_questions").select("test_id,question_id").limit(10000),
        db.from("exam_questions").select("id,text,answer,subject_slug,type,is_published").eq("is_published", true).limit(5000)
      ]);
      if (tests.error || questions.error || links.error || exam.error) return error(c, rid, 503, "VALIDATION_FAILED", "Не удалось проверить данные");
      const testIds = new Set((tests.data || []).map((x: any) => String(x.id)));
      const questionIds = new Set((questions.data || []).map((x: any) => String(x.id)));
      const counts: Record<string, number> = {};
      const issues: any[] = [];
      for (const link of links.data || []) {
        const tid = String((link as any).test_id), qid = String((link as any).question_id);
        counts[tid] = (counts[tid] || 0) + 1;
        if (!testIds.has(tid)) issues.push({ type: "orphan_test_link", test_id: tid, question_id: qid });
        if (!questionIds.has(qid)) issues.push({ type: "orphan_question_link", test_id: tid, question_id: qid });
      }
      for (const test of tests.data || []) if ((test as any).is_published && !(test as any).archived_at && !(counts[String((test as any).id)] > 0)) issues.push({ type: "published_test_without_questions", id: (test as any).id, title: (test as any).title || "" });
      for (const question of exam.data || []) if (!String((question as any).answer || "").trim() && ["mc","mcq","case"].includes(String((question as any).type || ""))) issues.push({ type: "published_exam_question_without_answer", id: (question as any).id, subject_slug: (question as any).subject_slug || null });
      return c.json(ok({ ok: issues.length === 0, issues: issues.slice(0, 500), count: issues.length, checked: { tests: tests.data?.length || 0, questions: questions.data?.length || 0, test_questions: links.data?.length || 0, exam_questions: exam.data?.length || 0 } }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "VALIDATION_FAILED", "Не удалось проверить данные"); }
  });
}
