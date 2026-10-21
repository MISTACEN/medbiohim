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
import { optionalAuth, type AuthVariables } from "../middleware/auth";

const colloquium = new Hono<{ Bindings: Env; Variables: Partial<AuthVariables> }>();

async function readDoc(c: any, key: string): Promise<{ data: any; unavailable: boolean }> {
  const primary = c.get("supabase");
  const service = createServiceClient(c.env);
  let result: any = primary
    ? await primary.from("site_content").select("payload,updated_at").eq("key", key).maybeSingle()
    : null;

  if ((!result || result.error) && service) {
    result = await service.from("site_content").select("payload,updated_at").eq("key", key).maybeSingle();
  }
  if (!result) return { data: null, unavailable: true };
  if (result.error) throw result.error;
  return { data: result.data, unavailable: false };
}

colloquium.get("/:subject", optionalAuth, async (c) => {
  const rid = requestId();
  const subject = parseColloquiumSubject(c.req.param("subject"));
  if (!subject) {
    const { body, status } = fail("NOT_FOUND", "Коллоквиум не найден", 404, rid);
    return c.json(body, status as 404);
  }

  try {
    const [settingsResult, contentResult] = await Promise.all([
      readDoc(c, colloquiumSettingsKey(subject)),
      readDoc(c, colloquiumContentKey(subject)),
    ]);

    if (settingsResult.unavailable) {
      return c.json(
        ok(
          {
            settings: COLLOQUIUM_DEFAULTS,
            content: null,
            source: "defaults",
            degraded: true,
          },
          rid,
        ),
      );
    }

    const settingsRow = settingsResult.data;
    const contentRow = contentResult.data;
    const merged = mergeColloquiumSettings(settingsRow?.payload || {}, COLLOQUIUM_DEFAULTS);
    const settings = "value" in merged ? merged.value : COLLOQUIUM_DEFAULTS;
    let content = null;
    if (contentRow?.payload) {
      const normalized = normalizeColloquiumContent(contentRow.payload);
      content = "value" in normalized ? normalized.value : null;
    }

    return c.json(
      ok(
        {
          settings,
          content,
          source: settingsRow ? "site_content" : "defaults",
          updated_at: settingsRow?.updated_at || null,
          content_updated_at: contentRow?.updated_at || null,
        },
        rid,
      ),
    );
  } catch (cause) {
    console.error("[colloquium:read]", cause);
    return c.json(
      ok(
        {
          settings: COLLOQUIUM_DEFAULTS,
          content: null,
          source: "defaults",
          degraded: true,
        },
        rid,
      ),
    );
  }
});

export default colloquium;
