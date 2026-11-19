import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { STRICT_ADMINS, bodyJson, error, gate, readAnnouncements, validText, writeAnnouncements, type AdminApp } from "./shared";

/**
 * Объявления сайта в site_content.
 */
export function registerAnnouncements(admin: AdminApp) {


  admin.get("/announcements", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return c.res;
    try {
      const payload = await readAnnouncements(c);
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
      // Закреплённое объявление — первым, остальные от новых к старым: тот же порядок,
      // что видит студент на главной.
      const sorted = [...items].sort((a: any, b: any) => {
        const pin = Number(Boolean(b?.pinned)) - Number(Boolean(a?.pinned));
        if (pin !== 0) return pin;
        return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
      });
      return c.json(ok({ items: sorted }, rid));
    } catch (cause) {
      console.error("[admin:announcements:list]", cause);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить объявления");
    }
  });

  admin.post("/announcements", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return c.res;
    const input = await bodyJson(c);
    if (!validText(input?.title, 200) || !validText(input?.body, 5000)) return error(c, rid, 422, "VALIDATION_ERROR", "Укажите заголовок и текст объявления");
    try {
      const payload = await readAnnouncements(c);
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
      const item = { id: crypto.randomUUID(), title: input.title.trim(), body: input.body.trim(), pinned: input.pinned === true, created_at: new Date().toISOString() };
      const nextPayload = Array.isArray(payload) ? [...items, item] : { ...(payload && typeof payload === "object" ? payload : {}), items: [...items, item] };
      await writeAnnouncements(c, nextPayload, item.created_at);
      return c.json(ok({ item }, rid), 201);
    } catch (cause) {
      console.error("[admin:announcements:create]", cause);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось опубликовать объявление");
    }
  });

  // Правка объявления: раньше исправить опечатку можно было только удалением и
  // повторной публикацией, а закрепить объявление — вообще никак.
  admin.patch("/announcements/:id", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return c.res;
    const id = c.req.param("id") || "";
    const input = await bodyJson(c);
    const hasTitle = input?.title !== undefined;
    const hasBody = input?.body !== undefined;
    const hasPinned = input?.pinned !== undefined;
    if (!hasTitle && !hasBody && !hasPinned) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
    if (hasTitle && !validText(input.title, 200)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный заголовок — от 1 до 200 символов");
    if (hasBody && !validText(input.body, 5000)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный текст — от 1 до 5000 символов");
    if (hasPinned && typeof input.pinned !== "boolean") return error(c, rid, 422, "VALIDATION_ERROR", "Флаг закрепления должен быть true или false");
    try {
      const payload = await readAnnouncements(c);
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
      const index = items.findIndex((item: any) => String(item?.id || "") === id);
      if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Объявление не найдено");
      const updatedAt = new Date().toISOString();
      const item = {
        ...items[index],
        ...(hasTitle ? { title: String(input.title).trim() } : {}),
        ...(hasBody ? { body: String(input.body).trim() } : {}),
        ...(hasPinned ? { pinned: input.pinned === true } : {}),
        updated_at: updatedAt,
      };
      const nextItems = items.map((current: any, position: number) => (position === index ? item : current));
      await writeAnnouncements(c, Array.isArray(payload) ? nextItems : { ...payload, items: nextItems }, updatedAt);
      return c.json(ok({ item }, rid));
    } catch (cause) {
      console.error("[admin:announcements:update]", cause);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить объявление");
    }
  });

  admin.delete("/announcements/:id", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return c.res;
    const id = c.req.param("id");
    try {
      const payload = await readAnnouncements(c);
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
      const nextItems = items.filter((item: any) => String(item?.id || "") !== id);
      if (nextItems.length === items.length) return error(c, rid, 404, "NOT_FOUND", "Объявление не найдено");
      const nextPayload = Array.isArray(payload) ? nextItems : { ...payload, items: nextItems };
      await writeAnnouncements(c, nextPayload, new Date().toISOString());
      return c.json(ok({ deleted: true, id }, rid));
    } catch (cause) {
      console.error("[admin:announcements:delete]", cause);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить объявление");
    }
  });
}
