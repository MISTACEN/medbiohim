import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import {
  ATTESTATION_TYPES,
  attestationAvailable,
  attestationKey,
  summarizeAttestation,
  type Attestation,
} from "../lib/attestation";

const attestations = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * site_content rows for attestations are readable through the service client:
 * the published document must be available to every signed-in student even when
 * the content table only exposes a few keys to the authenticated role.
 */
function reader(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

/**
 * GET /attestations?subject_slug=histology&type=colloquium
 * Published attestations as compact summaries.
 */
attestations.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const subject = (c.req.query("subject_slug") || "").trim();
  const type = (c.req.query("type") || "").trim();
  if (subject && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(subject)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный subject_slug", 422, rid), 422);
  }
  if (type && !ATTESTATION_TYPES.includes(type as any)) {
    return c.json(fail("VALIDATION_ERROR", "Неизвестный тип аттестации", 422, rid), 422);
  }

  try {
    let query = reader(c)
      .from("site_content")
      .select("key,payload,updated_at")
      .like("key", "attestation:%")
      .limit(500);
    if (subject) query = query.like("key", `attestation:${subject}:%`);

    const { data, error } = await query;
    if (error) {
      console.error("[attestations:list]", error);
      return c.json(fail("DB_UNAVAILABLE", "Аттестации временно недоступны", 503, rid), 503);
    }

    const now = new Date();
    const items = (data || [])
      .map((row: any) => row?.payload as Attestation)
      .filter((value: Attestation): value is Attestation => Boolean(value && value.slug && Array.isArray(value.stages)))
      .filter((value: Attestation) => value.is_published && attestationAvailable(value, now))
      .filter((value: Attestation) => (type ? value.type === type : true))
      .map(summarizeAttestation)
      .sort((a: ReturnType<typeof summarizeAttestation>, b: ReturnType<typeof summarizeAttestation>) => a.title.localeCompare(b.title, "ru"));

    return c.json(ok({ items, count: items.length }, rid));
  } catch (error) {
    console.error("[attestations:list]", error);
    return c.json(fail("DB_UNAVAILABLE", "Аттестации временно недоступны", 503, rid), 503);
  }
});

/**
 * GET /attestations/:subject/:slug — full published document.
 */
attestations.get("/:subject/:slug", requireAuth, async (c) => {
  const rid = requestId();
  const subject = c.req.param("subject") ?? "";
  const slug = c.req.param("slug") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(subject) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный адрес аттестации", 422, rid), 422);
  }

  try {
    const { data, error } = await reader(c)
      .from("site_content")
      .select("payload,updated_at")
      .eq("key", attestationKey(subject, slug))
      .maybeSingle();
    if (error) {
      console.error("[attestations:get]", error);
      return c.json(fail("DB_UNAVAILABLE", "Аттестация временно недоступна", 503, rid), 503);
    }

    const value = data?.payload as Attestation | undefined;
    if (!value || !value.is_published || value.subject_slug !== subject || value.slug !== slug) {
      return c.json(fail("NOT_FOUND", "Аттестация не найдена", 404, rid), 404);
    }
    if (!attestationAvailable(value)) {
      return c.json(fail("NOT_AVAILABLE", "Аттестация сейчас закрыта", 403, rid), 403);
    }

    return c.json(ok({ item: value, updated_at: data?.updated_at || null }, rid));
  } catch (error) {
    console.error("[attestations:get]", error);
    return c.json(fail("DB_UNAVAILABLE", "Аттестация временно недоступна", 503, rid), 503);
  }
});

export default attestations;
