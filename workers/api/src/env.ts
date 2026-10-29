/** Typed environment bindings for the Worker. */
export type Env = {
  // Cloudflare Workers AI (no API key; bound in wrangler.toml).
  AI?: Ai;
  CLOUDFLARE_AI_MODEL?: string;
  /** cloudflare (default) | auto | gigachat. */
  AI_SORT_PROVIDER?: string;
  // Compatibility service binding for legacy routes not yet ported to Hono.
  MEDBIOHIM_UPSTREAM?: { fetch: (request: Request | string, init?: RequestInit) => Promise<Response> };
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;

  // Upstash Redis
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  // Upstash Blob (private object storage)
  UPSTASH_BLOB_TOKEN?: string;
  // Public Upstash Blob endpoint used for authenticated Worker-side media proxying.
  UPSTASH_BLOB_PUBLIC_BASE_URL?: string;

  // Telegram bot administration (secrets must be configured in Cloudflare, never committed)
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  // Shared secret for the internal API → bot call (falls back to TELEGRAM_WEBHOOK_SECRET).
  TELEGRAM_INTERNAL_SECRET?: string;
  // Public endpoint on the bot Worker that verifies Mini App initData; that Worker
  // is the only place that holds the bot token.
  TELEGRAM_BOT_VERIFY_URL?: string;
  TELEGRAM_WEBHOOK_ORIGIN?: string;
  TELEGRAM_WEBHOOK_URL?: string;
  TELEGRAM_BOT_USERNAME?: string;

  // AI providers configured from Worker secrets
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_BASE_URL?: string;
  GROQ_MODEL?: string;
  MISTRAL_API_KEY?: string;
  MISTRAL_BASE_URL?: string;
  MISTRAL_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GIGACHAT_CREDENTIALS?: string;
  GIGACHAT_AUTH_KEY?: string;
  GIGACHAT_ACCESS_TOKEN?: string;
  GIGACHAT_MODEL?: string;
  GIGACHAT_SCOPE?: string;
  GIGACHAT_BASE_URL?: string;
  /** HTTPS relay for runtimes that do not trust the Russian Trusted CA. */
  GIGACHAT_RELAY_URL?: string;
  GIGACHAT_RELAY_SECRET?: string;
  /** "1" forces direct OAuth + chat from the Worker (local tests/diagnostics). */
  GIGACHAT_DIRECT?: string;

  // Telegram group ingestion. The bot Worker forwards group updates here with
  // TELEGRAM_WEBHOOK_SECRET; no user session exists in that flow.
  TELEGRAM_INGEST_SECRET?: string;
  LLM_PRIMARY_API_KEY?: string;
  AI_BACKEND_REGION?: string;
  GEMINI_VERCEL_PROXY_URL?: string;
  GEMINI_VERCEL_PROXY_SECRET?: string;
  AI_CHAT_PRIMARY_PROVIDER?: string;

  // App
  APP_ENV?: string;
  APP_ORIGIN?: string;
  CORS_ORIGINS?: string;
};

export function requireEnv(env: Env, key: keyof Env): string {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required env: ${String(key)}`);
  }
  return value.trim();
}

export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
