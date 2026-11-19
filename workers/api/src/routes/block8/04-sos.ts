import { ok, requestId } from "../../lib/response";
import { requireAuth, requireAdmin } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { UUID, err } from "./shared";

import type { Block8Router } from "./types";

export function registerSosRoutes(block8: Block8Router) {
block8.post("/sos", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const message = String(input?.message || "").trim();
  if (!message) return err(c, rid, 422, "VALIDATION_ERROR", "Опишите проблему");
  if (message.length > 2000) return err(c, rid, 413, "PAYLOAD_TOO_LARGE", "Сообщение слишком длинное");
  const pageUrl = String(input?.page_url || "").slice(0, 500) || null;
  // Категория жалобы (форма «Жалоба на ошибку на сайте»): недопустимое
  // значение молча приводим к «other», чтобы не ломать старые клиенты.
  const ALLOWED_CATEGORIES = new Set(["content", "test", "broken", "typo", "other"]);
  const rawCategory = String(input?.category || "").trim();
  const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : "other";
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    // Антифлуд: не больше 5 SOS в час от одного пользователя (считаем открытые).
    const userId = c.get("user").id;
    const { count, error: floodError } = await service
      .from("sos_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "open")
      .gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if (floodError) throw floodError;
    if (Number(count || 0) >= 5) {
      return err(c, rid, 429, "RATE_LIMITED", "Слишком много обращений — подождите, администратор уже видит ваши сообщения");
    }
    const { data, error: insertError } = await service
      .from("sos_reports")
      .insert({ user_id: userId, message, page_url: pageUrl, category })
      .select("id,created_at")
      .single();
    if (insertError) throw insertError;
    return c.json(ok({ report: data }, rid), 201);
  } catch (sosError) {
    console.error("[block8:sos-create]", sosError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отправить обращение");
  }
});

block8.get("/admin/sos", requireAuth, requireAdmin, async (c) => {
  const rid = requestId();
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data, error: readError } = await service
      .from("sos_reports")
      .select("id,user_id,message,page_url,category,status,created_at,users!sos_reports_user_id_fkey(full_name,display_name,email)")
      .order("created_at", { ascending: false }).limit(200);
    if (readError) throw readError;
    const items = (data || []).map((row: any) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return { ...row, users: undefined, user_name: user?.full_name || user?.display_name || user?.email || "—" };
    });
    return c.json(ok({ items }, rid));
  } catch (listError) {
    console.error("[block8:sos-list]", listError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Обращения недоступны");
  }
});

block8.post("/admin/sos/:id/close", requireAuth, requireAdmin, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID");
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { error: closeError } = await service
      .from("sos_reports")
      .update({ status: "closed", closed_by: c.get("user").id, closed_at: new Date().toISOString() })
      .eq("id", id).eq("status", "open");
    if (closeError) throw closeError;
    return c.json(ok({ closed: true }, rid));
  } catch (closeError) {
    console.error("[block8:sos-close]", closeError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось закрыть обращение");
  }
});
}
