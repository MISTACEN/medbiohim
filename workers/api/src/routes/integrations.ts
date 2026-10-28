/**
 * Manual imports from external study portals (EIOS, NeoFamily, Sechenov school).
 *
 * The browser extension only sends what the user explicitly selected; nothing is
 * crawled. Records live in `imported_sources` (private per user, RLS owner-only);
 * legacy rows from the old `site_content` keys `extimport:<user>:<hash>` are
 * still readable until the one-off migration drains them (20261028_imported_sources.sql).
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

const integrations = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const SOURCES = new Set(["eios", "neofamily", "sechenov", "fesmu", "other"]);
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

function legacyPrefix(userId: string) {
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

function rowToItem(row: any): ImportItem & { updated_at?: string } {
  return {
    id: String(row.content_hash || row.id || ""),
    source: String(row.source || "other"),
    kind: String(row.kind || "link"),
    title: String(row.title || ""),
    url: String(row.url || ""),
    summary: row.summary || undefined,
    published_at: row.published_at || null,
    imported_at: String(row.created_at || row.imported_at || ""),
    updated_at: row.updated_at,
  };
}

integrations.get("/imports", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  try {
    const { data, error } = await store(c)
      .from("imported_sources")
      .select("id,content_hash,source,kind,title,url,summary,published_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    const items = (data || []).map(rowToItem);

    // Legacy-ключи site_content, ещё не перенесённые разовой миграцией.
    const legacy = await store(c)
      .from("site_content")
      .select("key,payload,updated_at")
      .like("key", `${legacyPrefix(user.id)}%`)
      .limit(300);
    if (!legacy.error) {
      const known = new Set(items.map((item: ImportItem) => item.id));
      for (const row of legacy.data || []) {
        const item = rowToItem({ ...row.payload, content_hash: String(row.key || "").split(":").pop(), created_at: row.payload?.imported_at });
        if (item.id && !known.has(item.id)) items.push(item);
      }
      items.sort((a: any, b: any) => String(b.imported_at || "").localeCompare(String(a.imported_at || "")));
    }
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
      .from("imported_sources")
      .select("content_hash")
      .eq("user_id", user.id)
      .limit(500);
    if (existing.error) throw existing.error;
    const known = new Set((existing.data || []).map((row: any) => String(row.content_hash)));

    const rows = [];
    let skipped = 0;
    for (const item of normalized.items as ImportItem[]) {
      const hash = await hashUrl(item.url);
      if (known.has(hash)) {
        skipped += 1;
        continue;
      }
      known.add(hash);
      rows.push({
        user_id: user.id,
        source: item.source,
        kind: item.kind,
        content_hash: hash,
        title: item.title,
        url: item.url,
        summary: item.summary || null,
        published_at: item.published_at || null,
      });
    }

    let saved: any[] = [];
    if (rows.length) {
      const { data, error } = await db.from("imported_sources").upsert(rows, { onConflict: "user_id,content_hash" }).select();
      if (error) throw error;
      saved = data || [];
    }
    return c.json(ok({ imported: saved.length, skipped, items: saved.map(rowToItem) }, rid), 201);
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
    const db = store(c);
    const { data, error } = await db
      .from("imported_sources")
      .delete()
      .eq("user_id", user.id)
      .eq("content_hash", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Legacy-запись ещё в site_content — удаляем оттуда.
      const legacy = await db
        .from("site_content")
        .delete()
        .eq("key", `${legacyPrefix(user.id)}${id}`)
        .select("key")
        .maybeSingle();
      if (legacy.error) throw legacy.error;
      if (!legacy.data) return c.json(fail("NOT_FOUND", "Импорт не найден", 404, rid), 404);
    }
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
