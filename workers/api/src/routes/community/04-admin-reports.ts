import { ok, fail, requestId } from "../../lib/response";
import { requireAdmin } from "../../middleware/auth";
import { GROUP_ID } from "./shared";

import type { CommunityRouter } from "./types";

export function registerAdminReportRoutes(community: CommunityRouter) {
community.get("/admin/reports", requireAdmin, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    // Без вложенных join: PostgREST не знает связи community_reports.reporter_user_id
    // с public.users и отвечал ошибкой, из-за которой очередь всегда была 503.
    const { data, error } = await supabase
      .from("community_reports")
      .select("id,post_id,reporter_user_id,reason,status,created_at,resolved_at")
      .order("status", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Очередь жалоб недоступна", 503, rid); return c.json(body, status as 503); }
    const rows = data || [];
    const postIds = [...new Set(rows.map((row: any) => String(row.post_id || "")).filter(Boolean))];
    const userIds = [...new Set(rows.map((row: any) => String(row.reporter_user_id || "")).filter(Boolean))];
    const [posts, users] = await Promise.all([
      postIds.length ? supabase.from("community_posts").select("id,title").in("id", postIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? supabase.from("users").select("id,full_name").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const postTitles = new Map((posts?.data || []).map((row: any) => [String(row.id), row.title || null]));
    const userNames = new Map((users?.data || []).map((row: any) => [String(row.id), row.full_name || null]));
    const items = rows.map((row: any) => ({
      id: row.id,
      post_id: row.post_id,
      post_title: postTitles.get(String(row.post_id)) ?? null,
      reporter_name: userNames.get(String(row.reporter_user_id)) ?? null,
      reason: row.reason,
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    }));
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Очередь жалоб недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

community.patch("/admin/reports/:id", requireAdmin, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const reportId = String(c.req.param("id") || "");
  if (!GROUP_ID.test(reportId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID жалобы", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: { status?: string } = {};
  try { payload = await c.req.json(); } catch {}
  const status = String(payload.status || "");
  if (!["resolved", "dismissed"].includes(status)) {
    const { body, status } = fail("VALIDATION", "Статус: resolved или dismissed", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("community_reports")
      .update({ status, resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq("id", reportId)
      .select("id,status")
      .maybeSingle();
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить жалобу", 503, rid); return c.json(body, status as 503); }
    if (!data) { const { body, status } = fail("NOT_FOUND", "Жалоба не найдена", 404, rid); return c.json(body, status as 404); }
    return c.json(ok({ report: data }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить жалобу", 503, rid);
    return c.json(body, status as 503);
  }
});
}
