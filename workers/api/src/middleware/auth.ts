import type { Context, Next } from "hono";
import type { User } from "@supabase/supabase-js";
import type { Env } from "../env";
import { verifyBearerUser, createUserClient } from "../lib/supabase";
import { fail } from "../lib/response";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthVariables = {
  user: User;
  accessToken: string;
  supabase: SupabaseClient;
  requestId: string;
};

export async function requireAuth(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) {
  const rid = c.get("requestId") || crypto.randomUUID().slice(0, 16);
  try {
    const verified = await verifyBearerUser(c.env, c.req.header("Authorization"));
    if (!verified) {
      const { body, status } = fail("UNAUTHORIZED", "Требуется авторизация", 401, rid);
      return c.json(body, status as 401);
    }
    c.set("user", verified.user);
    c.set("accessToken", verified.accessToken);
    c.set("supabase", createUserClient(c.env, verified.accessToken));
    await next();
  } catch {
    const { body, status } = fail("AUTH_ERROR", "Ошибка проверки сессии", 503, rid);
    return c.json(body, status as 503);
  }
}

export async function optionalAuth(c: Context<{ Bindings: Env; Variables: Partial<AuthVariables> }>, next: Next) {
  try {
    const verified = await verifyBearerUser(c.env, c.req.header("Authorization"));
    if (verified) {
      c.set("user", verified.user);
      c.set("accessToken", verified.accessToken);
      c.set("supabase", createUserClient(c.env, verified.accessToken));
    }
  } catch {
    // ignore
  }
  await next();
}
