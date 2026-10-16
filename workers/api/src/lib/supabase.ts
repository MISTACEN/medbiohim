import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Env } from "../env";
import { isHttpsUrl, requireEnv } from "../env";

export function createUserClient(env: Env, accessToken: string): SupabaseClient {
  const url = requireEnv(env, "SUPABASE_URL");
  const anon = requireEnv(env, "SUPABASE_ANON_KEY");
  if (!isHttpsUrl(url)) {
    throw new Error("SUPABASE_URL must be HTTPS");
  }
  return createClient(url, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createAnonClient(env: Env): SupabaseClient {
  const url = requireEnv(env, "SUPABASE_URL");
  const anon = requireEnv(env, "SUPABASE_ANON_KEY");
  if (!isHttpsUrl(url)) {
    throw new Error("SUPABASE_URL must be HTTPS");
  }
  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Optional admin client — only when service role is configured. Prefer RLS. */
export function createServiceClient(env: Env): SupabaseClient | null {
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY)?.trim();
  if (!key) return null;
  const url = requireEnv(env, "SUPABASE_URL");
  if (!isHttpsUrl(url)) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function verifyBearerUser(
  env: Env,
  authorization: string | undefined
): Promise<{ user: User; accessToken: string } | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const accessToken = authorization.slice(7).trim();
  if (!accessToken) return null;

  const client = createAnonClient(env);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { user: data.user, accessToken };
}
