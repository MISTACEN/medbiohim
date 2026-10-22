import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { attestationKey, normalizeAttestation, summarizeAttestation, type Attestation } from "../lib/attestation";

const adminAttestations = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const MANAGERS = ["admin", "moderator", "teacher"];

function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

async function gate(c: any) {
  try {
    const user = c.get("user");
    const { data, error: queryError } = await c
      .get("supabase")
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", user.id)
      .limit(20);
    if (queryError) throw queryError;
    const codes = (data || []).map((row: any) => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      return String(role?.code || "");
    });
    if (codes.some((code: string) => MANAGERS.includes(code))) return true;
    c.res = error(c, requestId(), 403, "FORBIDDEN", "Недостаточно прав для управления аттестациями");
    return false;
  } catch {
    c.res = error(c, requestId(), 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
    return false;
  }
}

function store(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

/**
 * GET /admin/attestations — every attestation, including drafts.
 * Payloads are compact summaries; the editor loads the full document separately.
 */
adminAttestations.get("/attestations", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return;
  try {
    let query = store(c)
      .from("site_content")
      .select("key,payload,updated_at")
      .like("key", "attestation:%")
      .limit(500);
    const subject = (c.req.query("subject_slug") || "").trim();
    if (subject) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(subject)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_slug");
      query = query.like("key", `attestation:${subject}:%`);
    }
    const { data, error: dbError } = await query;
    if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить аттестации");
    const items = (data || [])
      .map((row: any) => row?.payload as Attestation)
      .filter((value: Attestation): value is Attestation => Boolean(value && value.slug && Array.isArray(value.stages)))
      .map((value: Attestation) => ({ ...summarizeAttestation(value), updated_at: null }));
    return c.json(ok({ items, count: items.length }, rid));
  } catch (caught) {
    console.error("[admin:attestations:list]", caught);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить аттестации");
  }
});

/** GET /admin/attestations/:subject/:slug — full document for the editor. */
adminAttestations.get("/attestations/:subject/:slug", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return;
  const subject = c.req.param("subject") ?? "";
  const slug = c.req.param("slug") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(subject) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный адрес аттестации");
  }
  try {
    const { data, error: dbError } = await store(c)
      .from("site_content")
      .select("payload,updated_at")
      .eq("key", attestationKey(subject, slug))
      .maybeSingle();
    if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить аттестацию");
    const value = data?.payload as Attestation | undefined;
    if (!value) return error(c, rid, 404, "NOT_FOUND", "Аттестация не найдена");
    return c.json(ok({ item: value, updated_at: data?.updated_at || null }, rid));
  } catch (caught) {
    console.error("[admin:attestations:get]", caught);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить аттестацию");
  }
});

/** PUT /admin/attestations/:subject/:slug — create or replace the document. */
adminAttestations.put("/attestations/:subject/:slug", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return;
  const subject = c.req.param("subject") ?? "";
  const slug = c.req.param("slug") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(subject) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный адрес аттестации");
  }
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const normalized = normalizeAttestation({ ...(input as object), slug, subject_slug: subject });
  if (!normalized.value) return error(c, rid, 422, "VALIDATION_ERROR", normalized.error || "Некорректная аттестация");
  const value = normalized.value;
  try {
    const { error: dbError } = await store(c)
      .from("site_content")
      .upsert(
        { key: attestationKey(subject, slug), payload: value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (dbError) {
      console.error("[admin:attestations:save]", dbError);
      return error(c, rid, 503, "SAVE_FAILED", "Не удалось сохранить аттестацию");
    }
    return c.json(ok({ item: value, summary: summarizeAttestation(value) }, rid));
  } catch (caught) {
    console.error("[admin:attestations:save]", caught);
    return error(c, rid, 503, "SAVE_FAILED", "Не удалось сохранить аттестацию");
  }
});

/** DELETE /admin/attestations/:subject/:slug */
adminAttestations.delete("/attestations/:subject/:slug", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return;
  const subject = c.req.param("subject") ?? "";
  const slug = c.req.param("slug") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(subject) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный адрес аттестации");
  }
  try {
    const { data, error: dbError } = await store(c)
      .from("site_content")
      .delete()
      .eq("key", attestationKey(subject, slug))
      .select("key")
      .maybeSingle();
    if (dbError) return error(c, rid, 503, "DELETE_FAILED", "Не удалось удалить аттестацию");
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Аттестация не найдена");
    return c.json(ok({ deleted: true }, rid));
  } catch (caught) {
    console.error("[admin:attestations:delete]", caught);
    return error(c, rid, 503, "DELETE_FAILED", "Не удалось удалить аттестацию");
  }
});

export default adminAttestations;
