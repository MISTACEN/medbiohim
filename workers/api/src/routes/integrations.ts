/**
 * Manual imports from external study portals (EIOS, NeoFamily, Sechenov school).
 *
 * The browser extension only sends what the user explicitly selected; nothing is
 * crawled. Records live in site_content under `extimport:<user id>:<hash>` so the
 * feature works without a schema migration, and every read/write is scoped to the
 * caller's own prefix. New table would be preferable once migrations run.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

const integrations = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const SOURCES = new Set(["eios", "neofamily", "sechenov", "other"]);
const KINDS = new Set(["announcement", "event", "document", "topic", "link"]);
const MAX_ITEMS = 50;

type ImportItem = {
  id: string;
  source: string;
  kind: string;
  title: string;
  url: string;
  summary?: string;
  published_at?: string | null;
  imported_at: string;
};

function store(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

function prefix(userId: string) {
  return `extimport:${userId}:`;
}

async function hashUrl(url: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeItems(raw: unknown): { items?: ImportItem[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Передайте хотя бы один элемент" };
  if (raw.length > MAX_ITEMS) return { error: `Не более ${MAX_ITEMS} элементов за раз` };
  const items: ImportItem[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") return { error: `Элемент ${index + 1}: ожидается объект` };
    const value = entry as Record<string, unknown>;
    const title = clean(value.title, 500);
    const url = clean(value.url, 2000);
    if (!title) return { error: `Элемент ${index + 1}: укажите заголовок` };
    if (!/^https?:\/\//i.test(url)) return { error: `Элемент ${index + 1}: ссылка должна начинаться с http(s)` };
    const source = SOURCES.has(String(value.source)) ? String(value.source) : "other";
    const kind = KINDS.has(String(value.kind)) ? String(value.kind) : "link";
    items.push({
      id: "",
      source,
      kind,
      title,
      url,
      summary: clean(value.summary, 4000) || undefined,
      published_at: clean(value.published_at, 40) || null,
      imported_at: new Date().toISOString(),
    });
  }
  return { items };
}

integrations.get("/imports", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  try {
    const { data, error } = await store(c)
      .from("site_content")
      .select("key,payload,updated_at")
      .like("key", `${prefix(user.id)}%`)
      .limit(300);
    if (error) throw error;
    const items = (data || [])
      .map((row: any) => ({ key: row.key, updated_at: row.updated_at, ...row.payload }))
      .sort((a: any, b: any) => String(b.imported_at || "").localeCompare(String(a.imported_at || "")));
    return c.json(ok({ items, count: items.length }, rid));
  } catch (error) {
    console.error("[integrations:list]", error);
    return c.json(fail("DB_UNAVAILABLE", "Импорт временно недоступен", 503, rid), 503);
  }
});

integrations.post("/imports", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  const normalized = normalizeItems(body?.items);
  if (!normalized.items) {
    return c.json(fail("VALIDATION_ERROR", normalized.error || "Некорректный пакет", 422, rid), 422);
  }
  try {
    const db = store(c);
    const existing = await db
      .from("site_content")
      .select("key")
      .like("key", `${prefix(user.id)}%`)
      .limit(300);
    if (existing.error) throw existing.error;
    const known = new Set((existing.data || []).map((row: any) => String(row.key)));

    const rows = [];
    let skipped = 0;
    for (const item of normalized.items) {
      const hash = await hashUrl(item.url);
      const key = `${prefix(user.id)}${hash}`;
      if (known.has(key)) {
        skipped += 1;
        continue;
      }
      known.add(key);
      rows.push({
        key,
        payload: { ...item, id: hash },
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error } = await db.from("site_content").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    }
    return c.json(ok({ imported: rows.length, skipped, items: rows.map((row) => row.payload) }, rid), 201);
  } catch (error) {
    console.error("[integrations:import]", error);
    return c.json(fail("IMPORT_FAILED", "Не удалось сохранить импорт", 503, rid), 503);
  }
});

integrations.delete("/imports/:id", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!/^[0-9a-f]{8,32}$/.test(id)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID импорта", 422, rid), 422);
  }
  try {
    const { data, error } = await store(c)
      .from("site_content")
      .delete()
      .eq("key", `${prefix(user.id)}${id}`)
      .select("key")
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json(fail("NOT_FOUND", "Импорт не найден", 404, rid), 404);
    return c.json(ok({ deleted: true }, rid));
  } catch (error) {
    console.error("[integrations:delete]", error);
    return c.json(fail("DELETE_FAILED", "Не удалось удалить импорт", 503, rid), 503);
  }
});

/** Compatibility endpoints used by the packaged extension. */
integrations.post("/fesmu/import", requireAuth, async (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/\/fesmu\/import$/, "/imports");
  const response = await integrations.fetch(new Request(url.toString(), c.req.raw), c.env);
  if (!response.ok) return response;
  const body: any = await response.json().catch(() => ({}));
  const items = Array.isArray(body?.data?.items) ? body.data.items : [];
  return c.json(ok({ imported: items.length, skipped: body?.data?.skipped || 0, items }, body?.request_id));
});

integrations.post("/fesmu/dedup", requireAuth, async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    /* empty body means nothing to deduplicate */
  }
  const hashes = Array.isArray(body?.items) ? body.items.map((value: unknown) => String(value)) : [];
  return c.json(ok({ unique_items: hashes, checked: hashes.length }, requestId()));
});

export default integrations;
