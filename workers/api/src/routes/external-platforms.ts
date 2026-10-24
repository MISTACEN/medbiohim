/**
 * Счётчик переходов на внешние учебные платформы (NEOFAMILY Lab, Школа Сеченова
 * и будущие). Только публичная навигация: platform slug, название ссылки и URL
 * раздела из src/data/external-platforms.ts — никакого пользовательского
 * контента. Таблица `external_platform_clicks` (см. database/migrations).
 *
 * POST /external-platforms/click  { platform, title, href, subject_slug? }
 * GET  /external-platforms/stats  → { total, items: [{ href, title, platform, clicks }] }
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { createAnonClient } from "../lib/supabase";

const externalPlatforms = new Hono<{ Bindings: Env }>();

const ALLOWED_PLATFORMS = new Set(["neofamily", "sechenov"]);

externalPlatforms.post("/click", async (c) => {
  const rid = requestId();
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const platform = String(payload?.platform || "").trim();
  const title = String(payload?.title || "").trim().slice(0, 200);
  const href = String(payload?.href || "").trim().slice(0, 500);
  const subjectSlug = String(payload?.subject_slug || "").trim().slice(0, 60) || null;
  if (!ALLOWED_PLATFORMS.has(platform) || !title || !/^https?:\/\//.test(href)) {
    const { body, status } = fail("BAD_REQUEST", "Некорректный переход", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const supabase = createAnonClient(c.env);
    const { error } = await supabase
      .from("external_platform_clicks")
      .insert({ platform, title, href, subject_slug: subjectSlug });
    if (error) throw error;
    return c.json(ok({ tracked: true }, rid));
  } catch (error) {
    console.error("[external-platforms:click]", error);
    // Счётчик не критичен для пользователя — отдаём успех, чтобы не ломать переход.
    return c.json(ok({ tracked: false }, rid));
  }
});

externalPlatforms.get("/stats", async (c) => {
  const rid = requestId();
  try {
    const supabase = createAnonClient(c.env);
    const { data, error } = await supabase
      .from("external_platform_clicks")
      .select("platform,title,href")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    const byLink = new Map<string, { platform: string; title: string; href: string; clicks: number }>();
    let total = 0;
    for (const row of data || []) {
      total += 1;
      const key = `${row.platform}:${row.href}`;
      const entry = byLink.get(key) || { platform: row.platform, title: row.title, href: row.href, clicks: 0 };
      entry.clicks += 1;
      byLink.set(key, entry);
    }
    const items = [...byLink.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
    return c.json(ok({ total, items }, rid));
  } catch (error) {
    console.error("[external-platforms:stats]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Статистика временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default externalPlatforms;
