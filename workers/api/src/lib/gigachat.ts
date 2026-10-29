/**
 * GigaChat client for server-side classification.
 *
 * GigaChat uses a certificate chain issued by the Russian Ministry of Digital
 * Development. Cloudflare Workers do not trust that chain, so a direct call from
 * the Worker fails with `SELF_SIGNED_CERT_IN_CHAIN`. We therefore support two
 * transports:
 *
 * 1. `GIGACHAT_RELAY_URL` — an HTTPS relay on a host that has the Russian
 *    Trusted CA installed (or is allowed to disable verification). The relay
 *    receives `{messages, temperature, max_tokens}` and returns
 *    `{ok:true, content, model}`. The shared secret is sent in
 *    `x-medbiohim-internal`.
 * 2. Direct OAuth + chat completions, useful in local tests and on runtimes
 *    that trust the certificate chain.
 *
 * Secrets and upstream response bodies never leave this module in errors.
 */
import type { Env } from "../env";

export type GigaChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type GigaChatResult = {
  content: string;
  model: string;
  provider: "gigachat";
};

export class GigaChatError extends Error {
  code: "NOT_CONFIGURED" | "NOT_AVAILABLE" | "EMPTY_RESPONSE" | "RATE_LIMIT";

  constructor(code: GigaChatError["code"], message: string) {
    super(message);
    this.name = "GigaChatError";
    this.code = code;
  }
}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function configuredToken(env: Env): string {
  return String(env.GIGACHAT_ACCESS_TOKEN || "").trim();
}

function configuredCredentials(env: Env): string {
  return String(env.GIGACHAT_CREDENTIALS || env.GIGACHAT_AUTH_KEY || "").trim();
}

export function gigachatConfigured(env: Env): boolean {
  return Boolean(configuredToken(env) || configuredCredentials(env) || env.GIGACHAT_RELAY_URL);
}

/** "relay" — явно заданный HTTPS-relay; "direct" — прямо из Worker. */
export function gigachatTransport(env: Env): "relay" | "direct" | "none" {
  if (!gigachatConfigured(env)) return "none";
  return String(env.GIGACHAT_RELAY_URL || "").trim() ? "relay" : "direct";
}

function relayEndpoint(env: Env): string {
  return String(env.GIGACHAT_RELAY_URL || "").trim();
}

function normalizeMessages(messages: GigaChatMessage[]): GigaChatMessage[] {
  return messages
    .filter((message) => message && ["system", "user", "assistant"].includes(message.role))
    .map((message) => ({ role: message.role, content: String(message.content || "").slice(0, 12_000) }))
    .filter((message) => message.content.trim().length > 0);
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function callRelay(
  env: Env,
  messages: GigaChatMessage[],
  temperature: number,
  maxTokens: number,
  fetcher: typeof fetch
): Promise<GigaChatResult> {
  const endpoint = relayEndpoint(env);
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new GigaChatError("NOT_CONFIGURED", "GigaChat relay URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new GigaChatError("NOT_CONFIGURED", "GigaChat relay must use HTTPS");
  }

  // A custom relay (for example the PHP backend) may expect its own shared
  // secret. The canonical Vercel relay authenticates with GigaChat credentials
  // and never sees (or returns) anything else.
  const relaySecret = String(env.GIGACHAT_RELAY_SECRET || "").trim();
  const credentials = configuredCredentials(env);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (relaySecret) headers["x-medbiohim-internal"] = relaySecret;
  if (credentials) headers["x-gigachat-auth"] = "Basic " + credentials;
  if (!relaySecret && !credentials) {
    throw new GigaChatError("NOT_CONFIGURED", "GigaChat relay credentials are not configured");
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(fetcher, url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        temperature,
        max_tokens: maxTokens,
        model: env.GIGACHAT_MODEL || "GigaChat",
      }),
    }, 28_000);
  } catch {
    throw new GigaChatError("NOT_AVAILABLE", "GigaChat relay is unavailable");
  }
  const body = await readJson(response);
  if (response.status === 429) throw new GigaChatError("RATE_LIMIT", "GigaChat rate limit");
  if (!response.ok || body?.ok !== true || typeof body?.content !== "string" || !body.content.trim()) {
    throw new GigaChatError("NOT_AVAILABLE", "GigaChat relay returned no content");
  }
  return {
    content: body.content.trim(),
    model: String(body.model || env.GIGACHAT_MODEL || "GigaChat"),
    provider: "gigachat",
  };
}

async function accessToken(env: Env, fetcher: typeof fetch, force = false): Promise<string> {
  const staticToken = configuredToken(env);
  if (staticToken) return staticToken;

  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 90_000) {
    return tokenCache.token;
  }

  const credentials = configuredCredentials(env);
  if (!credentials) throw new GigaChatError("NOT_CONFIGURED", "GigaChat credentials are not configured");

  let response: Response;
  try {
    response = await fetchWithTimeout(fetcher, "https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
      method: "POST",
      headers: {
        authorization: "Basic " + credentials,
        "content-type": "application/x-www-form-urlencoded",
        "RqUID": crypto.randomUUID(),
        accept: "application/json",
      },
      body: new URLSearchParams({ scope: env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS" }),
    }, 15_000);
  } catch {
    throw new GigaChatError("NOT_AVAILABLE", "GigaChat OAuth is unavailable");
  }
  const body = await readJson(response);
  const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !token) {
    if (response.status === 429) throw new GigaChatError("RATE_LIMIT", "GigaChat OAuth rate limit");
    throw new GigaChatError("NOT_AVAILABLE", "GigaChat OAuth failed");
  }
  const expiresAt = Number(body?.expires_at) > 0
    ? Number(body.expires_at)
    : Date.now() + 25 * 60_000;
  tokenCache = { token, expiresAt };
  return token;
}

async function callDirect(
  env: Env,
  messages: GigaChatMessage[],
  temperature: number,
  maxTokens: number,
  fetcher: typeof fetch
): Promise<GigaChatResult> {
  let token = await accessToken(env, fetcher);
  const base = String(env.GIGACHAT_BASE_URL || "https://gigachat.devices.sberbank.ru/api/v1").replace(/\/+$/, "");
  const model = env.GIGACHAT_MODEL || "GigaChat";

  const send = async (accessTokenValue: string) => {
    try {
      return await fetchWithTimeout(fetcher, base + "/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer " + accessTokenValue,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages,
        }),
      }, 25_000);
    } catch {
      throw new GigaChatError("NOT_AVAILABLE", "GigaChat is unavailable");
    }
  };

  let response = await send(token);
  if (response.status === 401) {
    token = await accessToken(env, fetcher, true);
    response = await send(token);
  }
  const body = await readJson(response);
  if (response.status === 429) throw new GigaChatError("RATE_LIMIT", "GigaChat rate limit");
  if (!response.ok) throw new GigaChatError("NOT_AVAILABLE", "GigaChat request failed");
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new GigaChatError("EMPTY_RESPONSE", "GigaChat returned empty content");
  }
  return {
    content: content.trim(),
    model: String(body?.model || model),
    provider: "gigachat",
  };
}

export async function gigachatComplete(
  env: Env,
  messages: GigaChatMessage[],
  options: { temperature?: number; maxTokens?: number; fetcher?: typeof fetch } = {}
): Promise<GigaChatResult> {
  const safeMessages = normalizeMessages(messages);
  if (!safeMessages.length) throw new GigaChatError("NOT_CONFIGURED", "Empty GigaChat context");
  const fetcher = options.fetcher || fetch;
  const temperature = Number.isFinite(options.temperature) ? Math.max(0, Math.min(1, Number(options.temperature))) : 0.1;
  const maxTokens = Number.isFinite(options.maxTokens) ? Math.max(64, Math.min(4000, Number(options.maxTokens))) : 1200;

  if (gigachatTransport(env) === "relay") {
    return callRelay(env, safeMessages, temperature, maxTokens, fetcher);
  }
  if (!configuredToken(env) && !configuredCredentials(env)) {
    throw new GigaChatError("NOT_CONFIGURED", "GigaChat is not configured");
  }
  return callDirect(env, safeMessages, temperature, maxTokens, fetcher);
}
