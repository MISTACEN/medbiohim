// BYOM: управление пользовательской ИИ-моделью («Своя ИИ-модель» в настройках).
// Провайдер — OpenAI-compatible (любой base_url) или Claude (Anthropic API).
// Ключ шифруется сервисом (AES-GCM, USER_KEY_ENCRYPTION_KEY) и не возвращается.

import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { encryptSecret, keyHint } from "../lib/user-ai-config";
import { fetchWithTimeout } from "../lib/fetch-with-timeout";

type Variables = AuthVariables;

const aiConfig = new Hono<{ Bindings: Env; Variables: Variables }>();

const PROVIDERS = new Set(["openai_compatible", "anthropic"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeBaseUrl(raw: unknown): string | null {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    return parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, ""));
  } catch {
    return null;
  }
}

// Текущая конфигурация (без ключа).
aiConfig.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  try {
    const { data, error } = await db
      .from("user_ai_configs")
      .select("provider,base_url,model,key_hint,prefer_own,updated_at")
      .eq("user_id", c.get("user").id)
      .maybeSingle();
    if (error) throw error;
    return c.json(ok({ config: data || null, encryption_ready: Boolean(c.env.USER_KEY_ENCRYPTION_KEY) }, rid));
  } catch (readError) {
    console.error("[ai-config:read]", readError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось прочитать конфигурацию");
  }
});

// Сохранить/обновить свою модель (ключ шифруется на воркере).
aiConfig.put("/", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  if (!c.env.USER_KEY_ENCRYPTION_KEY) {
    return err(c, rid, 503, "NOT_CONFIGURED", "Шифрование ключей не настроено на сервере");
  }
  const provider = String(input?.provider || "").trim();
  if (!PROVIDERS.has(provider)) {
    return err(c, rid, 422, "VALIDATION_ERROR", "provider: openai_compatible или anthropic");
  }
  const baseUrl = normalizeBaseUrl(input?.base_url);
  if (!baseUrl) return err(c, rid, 422, "VALIDATION_ERROR", "base_url: валидный https-адрес API провайдера");
  const model = String(input?.model || "").trim().slice(0, 160);
  if (!model) return err(c, rid, 422, "VALIDATION_ERROR", "Укажите имя модели");
  const apiKey = String(input?.api_key || "").trim();
  // api_key опционален для существующей конфигурации: так можно переключить
  // приоритет («моя модель первой») без переввода ключа. Ключ в открытом виде
  // на сервере не хранится — для «keep» сохраняем прежний шифротекст.
  const wantNewKey = apiKey.length > 0;
  if (wantNewKey && (apiKey.length < 8 || apiKey.length > 500)) {
    return err(c, rid, 422, "VALIDATION_ERROR", "api_key: 8–500 символов");
  }
  if (!wantNewKey && input?.api_key != null) {
    return err(c, rid, 422, "VALIDATION_ERROR", "api_key слишком короткий");
  }
  const preferOwn = input?.prefer_own !== false;

  const db = c.get("supabase");
  try {
    let existing: { api_key_encrypted: string; key_hint: string } | null = null;
    const { data: found } = await db
      .from("user_ai_configs")
      .select("api_key_encrypted,key_hint")
      .eq("user_id", c.get("user").id)
      .maybeSingle();
    existing = found || null;
    if (wantNewKey && !c.env.USER_KEY_ENCRYPTION_KEY) {
      return err(c, rid, 503, "NOT_CONFIGURED", "Шифрование ключей не настроено на сервере");
    }
    const encrypted = wantNewKey ? await encryptSecret(c.env, apiKey) : existing?.api_key_encrypted;
    const hint = wantNewKey ? keyHint(apiKey) : existing?.key_hint || "";
    if (!encrypted) {
      return err(c, rid, 422, "VALIDATION_ERROR", "api_key обязателен: конфигурации с ключом ещё нет");
    }
    const row = {
      user_id: c.get("user").id,
      provider,
      base_url: baseUrl,
      model,
      api_key_encrypted: encrypted,
      key_hint: hint,
      prefer_own: preferOwn,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db
      .from("user_ai_configs")
      .upsert(row, { onConflict: "user_id" })
      .select("provider,base_url,model,key_hint,prefer_own,updated_at")
      .single();
    if (error) throw error;
    return c.json(ok({ config: data }, rid));
  } catch (saveError) {
    console.error("[ai-config:save]", saveError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить конфигурацию");
  }
});

// Удалить свою модель — вернуть платформенные провайдеры.
aiConfig.delete("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  try {
    const { error } = await db.from("user_ai_configs").delete().eq("user_id", c.get("user").id);
    if (error) throw error;
    return c.json(ok({ deleted: true }, rid));
  } catch (deleteError) {
    console.error("[ai-config:delete]", deleteError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить конфигурацию");
  }
});

// Живая проверка ключа пользователя: минимальный запрос к его провайдеру.
// Тело конфига передаётся целиком (ключ не сохраняется, если тест не прошёл).
aiConfig.post("/test", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const provider = String(input?.provider || "").trim();
  if (!PROVIDERS.has(provider)) return err(c, rid, 422, "VALIDATION_ERROR", "provider: openai_compatible или anthropic");
  const baseUrl = normalizeBaseUrl(input?.base_url);
  if (!baseUrl) return err(c, rid, 422, "VALIDATION_ERROR", "base_url: валидный https-адрес");
  const model = String(input?.model || "").trim().slice(0, 160);
  const apiKey = String(input?.api_key || "").trim();
  if (!model || !apiKey) return err(c, rid, 422, "VALIDATION_ERROR", "model и api_key обязательны");

  const started = Date.now();
  try {
    let response: Response;
    if (provider === "anthropic") {
      response = await fetchWithTimeout(baseUrl + "/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(12_000),
      });
    } else {
      response = await fetchWithTimeout(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: "user", content: "ping" }] }),
        signal: AbortSignal.timeout(12_000),
      });
    }
    const ms = Date.now() - started;
    if (!response.ok) {
      // Тело ответа не пробрасываем: там могут быть эхо ключа/детали аккаунта.
      return c.json(ok({ ok: false, status: response.status, ms, error: "upstream_" + response.status }, rid));
    }
    return c.json(ok({ ok: true, status: response.status, ms }, rid));
  } catch (testError) {
    return c.json(ok({ ok: false, status: 0, ms: Date.now() - started, error: String(testError instanceof Error ? testError.message : "network") }, rid));
  }
});

export default aiConfig;

function err(c: any, rid: string, status: number, code: string, message: string) {
  const { body } = fail(code, message, status, rid);
  return c.json(body, status as any);
}
