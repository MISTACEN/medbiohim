/** Typed environment bindings for the Worker. */
export type Env = {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // Upstash Redis
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  // Upstash Blob (private object storage)
  UPSTASH_BLOB_TOKEN?: string;

  // OpenAI
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;

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
