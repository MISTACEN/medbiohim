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

/** Проверка роли admin (user_roles → roles.code). */
export async function requireAdmin(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) {
  const rid = c.get("requestId") || crypto.randomUUID().slice(0, 16);
  try {
    const verified = await verifyBearerUser(c.env, c.req.header("Authorization"));
    if (!verified) {
      const { body, status } = fail("UNAUTHORIZED", "Требуется авторизация", 401, rid);
      return c.json(body, status as 401);
    }
    const supabase = createUserClient(c.env, verified.accessToken);
    const { data: roleRows, error } = await supabase
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", verified.user.id)
      .limit(20);
    const roles = (roleRows || []).map((r: any) => String(r?.roles?.code || r?.roles || "")).filter(Boolean);
    if (error || !roles.includes("admin")) {
      const { body, status } = fail("FORBIDDEN", "Требуются права администратора", 403, rid);
      return c.json(body, status as 403);
    }
    c.set("user", verified.user);
    c.set("accessToken", verified.accessToken);
    c.set("supabase", supabase);
    await next();
  } catch {
    const { body, status } = fail("AUTH_ERROR", "Ошибка проверки прав", 503, rid);
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
