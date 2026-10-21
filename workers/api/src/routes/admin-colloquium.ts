import { Hono } from "hono";
import type { Env } from "../env";
import {
  COLLOQUIUM_DEFAULTS,
  colloquiumContentKey,
  colloquiumSettingsKey,
  mergeColloquiumSettings,
  normalizeColloquiumContent,
  parseColloquiumSubject,
} from "../lib/colloquium";
import { fail, ok, requestId } from "../lib/response";
import { createServiceClient } from "../lib/supabase";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const adminColloquium = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const ADMIN_ONLY = ["admin"];

function responseError(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

async function roleCodes(c: any): Promise<string[]> {
  const user = c.get("user");
  const { data, error } = await c
    .get("supabase")
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", user.id)
    .limit(20);
  if (error) throw error;
  return (data || [])
    .map((row: any) => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      return String(role?.code || "").toLowerCase();
    })
    .filter(Boolean);
}

async function gate(c: any): Promise<boolean> {
  try {
    if ((await roleCodes(c)).some((role) => ADMIN_ONLY.includes(role))) return true;
    c.res = responseError(c, requestId(), 403, "FORBIDDEN", "Недостаточно прав для настройки коллоквиума");
  } catch {
    c.res = responseError(c, requestId(), 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
  }
  return false;
}

async function readDoc(c: any, key: string) {
  const primary = c.get("supabase");
  const service = createServiceClient(c.env);
  let result = await primary
    .from("site_content")
    .select("payload,updated_at")
    .eq("key", key)
    .maybeSingle();
  if ((result.error || !result.data) && service) {
    result = await service
      .from("site_content")
      .select("payload,updated_at")
      .eq("key", key)
      .maybeSingle();
  }
  if (result.error) throw result.error;
  return result.data;
}

async function writeDoc(c: any, key: string, payload: unknown, updatedAt: string) {
  const primary = c.get("supabase");
  const service = createServiceClient(c.env);
  const row = { key, payload, updated_at: updatedAt };
  let result = await primary.from("site_content").upsert(row, { onConflict: "key" });
  if (result.error && service) {
    result = await service.from("site_content").upsert(row, { onConflict: "key" });
  }
  if (result.error) throw result.error;
}

async function deleteDoc(c: any, key: string) {
  const primary = c.get("supabase");
  const service = createServiceClient(c.env);
  let result = await primary.from("site_content").delete().eq("key", key);
  if (result.error && service) {
    result = await service.from("site_content").delete().eq("key", key);
  }
  if (result.error) throw result.error;
}

async function listDocs(c: any) {
  const primary = c.get("supabase");
  const service = createServiceClient(c.env);
  let result = await primary
    .from("site_content")
    .select("key,updated_at")
    .like("key", "colloquium:%");
  if ((result.error || !result.data?.length) && service) {
    result = await service.from("site_content").select("key,updated_at").like("key", "colloquium:%");
  }
  if (result.error) throw result.error;
  return result.data || [];
}

async function payloadFor(c: any, subject: string) {
  const [settingsRow, contentRow] = await Promise.all([
    readDoc(c, colloquiumSettingsKey(subject)),
    readDoc(c, colloquiumContentKey(subject)),
  ]);
  const merged = mergeColloquiumSettings(settingsRow?.payload || {}, COLLOQUIUM_DEFAULTS);
  const settings = "value" in merged ? merged.value : COLLOQUIUM_DEFAULTS;
  let content = null;
  if (contentRow?.payload) {
    const normalized = normalizeColloquiumContent(contentRow.payload);
    content = "value" in normalized ? normalized.value : null;
  }
  return {
    settings,
    content,
    source: settingsRow ? "site_content" : "defaults",
    updated_at: settingsRow?.updated_at || null,
    content_updated_at: contentRow?.updated_at || null,
  };
}

adminColloquium.use("*", requireAuth);

adminColloquium.get("/", async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;

  try {
    const rows = await listDocs(c);
    const items = rows
      .filter((row: any) => /^colloquium:[a-z0-9_-]+$/i.test(String(row.key || "")))
      .map((row: any) => {
        const rawSubject = String(row.key).slice("colloquium:".length);
        const subject = parseColloquiumSubject(rawSubject) || rawSubject;
        return {
          subject,
          updated_at: row.updated_at || null,
        };
      })
      .sort((a: any, b: any) => {
        if (a.subject === "physiology") return -1;
        if (b.subject === "physiology") return 1;
        return a.subject.localeCompare(b.subject);
      });
    return c.json(ok({ items }, rid));
  } catch (cause) {
    console.error("[admin:colloquium:list]", cause);
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось получить список коллоквиумов");
  }
});

adminColloquium.get("/:subject", async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const subject = parseColloquiumSubject(c.req.param("subject"));
  if (!subject) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный предмет коллоквиума");

  try {
    const data = await payloadFor(c, subject);
    return c.json(ok(data, rid));
  } catch (cause) {
    console.error("[admin:colloquium:get]", cause);
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить настройки коллоквиума");
  }
});

adminColloquium.put("/:subject", async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const subject = parseColloquiumSubject(c.req.param("subject"));
  if (!subject) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный предмет коллоквиума");

  let input: any;
  try {
    input = await c.req.json();
  } catch {
    return responseError(c, rid, 422, "VALIDATION_ERROR", "Ожидается JSON-объект");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return responseError(c, rid, 422, "VALIDATION_ERROR", "Ожидается JSON-объект");
  }
  if (input.settings === undefined && input.content === undefined) {
    return responseError(c, rid, 422, "VALIDATION_ERROR", "Нет полей settings или content");
  }

  try {
    const current = await payloadFor(c, subject);
    let settings = current.settings;
    let content = current.content;

    if (input.settings !== undefined) {
      const merged = mergeColloquiumSettings(input.settings, current.settings);
      if ("error" in merged) return responseError(c, rid, 422, "VALIDATION_ERROR", merged.error);
      settings = merged.value;
      if (settings.subject_slug !== subject) {
        return responseError(
          c,
          rid,
          422,
          "VALIDATION_ERROR",
          "subject_slug должен совпадать с предметом в адресе",
        );
      }
    }

    if (input.content !== undefined) {
      try {
        const normalized = normalizeColloquiumContent(input.content);
        if ("error" in normalized) return responseError(c, rid, 422, "VALIDATION_ERROR", normalized.error);
        content = normalized.value;
      } catch (cause) {
        return responseError(
          c,
          rid,
          422,
          "VALIDATION_ERROR",
          cause instanceof Error ? cause.message : "Некорректный контент",
        );
      }
    }

    const updatedAt = new Date().toISOString();
    if (input.settings !== undefined) {
      await writeDoc(c, colloquiumSettingsKey(subject), settings, updatedAt);
    }
    if (input.content !== undefined) {
      await writeDoc(c, colloquiumContentKey(subject), content, updatedAt);
    }

    const previousSubject = parseColloquiumSubject(input.previous_subject);
    if (previousSubject && previousSubject !== subject) {
      await deleteDoc(c, colloquiumSettingsKey(previousSubject));
      await deleteDoc(c, colloquiumContentKey(previousSubject));
    }

    return c.json(
      ok(
        {
          settings,
          content,
          source: "site_content",
          updated_at: input.settings !== undefined ? updatedAt : current.updated_at,
          content_updated_at: input.content !== undefined ? updatedAt : current.content_updated_at,
        },
        rid,
      ),
    );
  } catch (cause) {
    console.error("[admin:colloquium:put]", cause);
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить настройки коллоквиума");
  }
});

adminColloquium.delete("/:subject", async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const subject = parseColloquiumSubject(c.req.param("subject"));
  if (!subject) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный предмет коллоквиума");

  try {
    await deleteDoc(c, colloquiumSettingsKey(subject));
    await deleteDoc(c, colloquiumContentKey(subject));
    return c.json(ok({ deleted: true, subject }, rid));
  } catch (cause) {
    console.error("[admin:colloquium:delete]", cause);
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сбросить настройки коллоквиума");
  }
});

export default adminColloquium;
