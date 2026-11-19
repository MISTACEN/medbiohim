import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../env";
import { isHttpsUrl, requireEnv } from "../../env";
import { ok, requestId } from "../../lib/response";
import { createAnonClient } from "../../lib/supabase";
export const MAX_BODY = 16 * 1024;

export async function readJson<T>(c: { req: { raw: Request } }): Promise<T | null> {
  const raw = await c.req.raw.clone().arrayBuffer();
  if (raw.byteLength > MAX_BODY) return null;
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  } catch {
    return null;
  }
}

/**
 * Клиент с заголовками реального пользователя: GoTrue записывает User-Agent
 * и IP из запроса в сессию. Без пересылки все устройства выглядят как
 * Cloudflare-эгресс и «Неизвестное устройство».
 */
export function clientWithRealIdentity(c: { req: { header: (n: string) => string | undefined } }, env: Env): SupabaseClient {
  const url = requireEnv(env, "SUPABASE_URL");
  const anon = requireEnv(env, "SUPABASE_ANON_KEY");
  if (!isHttpsUrl(url)) throw new Error("SUPABASE_URL must be HTTPS");
  const userAgent = c.req.header("user-agent") || "unknown";
  const ip = clientIp(c);
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        "user-agent": userAgent,
        "x-forwarded-for": ip,
        "x-real-ip": ip,
      },
    },
  });
}

export function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function normalizeSession(session: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: { id?: string; email?: string; app_metadata?: Record<string, unknown> };
}) {
  return {
    access_token: session.access_token ?? null,
    refresh_token: session.refresh_token ?? null,
    expires_in: session.expires_in ?? null,
    expires_at: session.expires_at ?? null,
    token_type: session.token_type ?? "bearer",
    user: session.user
      ? {
          id: session.user.id,
          email: session.user.email,
          role: (session.user.app_metadata as { role?: string } | undefined)?.role ?? null,
        }
      : null,
  };
}

export type TelegramSession =
  | { ok: true; session: ReturnType<typeof normalizeSession> }
  | { ok: false; code: string; message: string; status: number };

/**
 * Shared tail of both Telegram login routes (Mini App initData and the website
 * Login Widget): a verified Telegram identity is resolved to the linked account
 * and a Supabase session is minted server-side — the magic-link token is
 * consumed in-process and never emailed.
 */
export async function mintTelegramSession(
  service: SupabaseClient,
  env: Env,
  telegramUserId: number,
  rid: string
): Promise<TelegramSession> {
  const { data: account, error: accountError } = await service
    .from("telegram_accounts")
    .select("user_id")
    .eq("telegram_user_id", String(telegramUserId))
    .maybeSingle();
  if (accountError) {
    console.error("[auth:telegram-mint]", { stage: "account_lookup", code: accountError.code, requestId: rid });
    return { ok: false, code: "TELEGRAM_LOGIN_UNAVAILABLE", message: "Вход через Telegram временно недоступен", status: 503 };
  }

  const linkedUserId = account?.user_id ? String(account.user_id) : "";
  if (!linkedUserId) {
    return {
      ok: false,
      code: "TELEGRAM_NOT_LINKED",
      message: "Telegram не привязан. Привяжите аккаунт в Настройках → Telegram.",
      status: 409,
    };
  }

  const { data: adminUser, error: adminUserError } = await service.auth.admin.getUserById(linkedUserId);
  if (adminUserError || !adminUser?.user) {
    console.error("[auth:telegram-mint]", { stage: "user_lookup", code: adminUserError?.code, requestId: rid });
    return { ok: false, code: "AUTH_UPSTREAM", message: "Сервис авторизации временно недоступен", status: 503 };
  }

  const email = adminUser.user.email?.trim();
  if (!email) {
    // A profile without an email cannot receive a server-issued session.
    return {
      ok: false,
      code: "TELEGRAM_NO_EMAIL",
      message: "Для профиля не задан email. Обратитесь в поддержку.",
      status: 409,
    };
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("[auth:telegram-mint]", { stage: "generate_link", code: linkError?.code, requestId: rid });
    return { ok: false, code: "AUTH_UPSTREAM", message: "Сервис авторизации временно недоступен", status: 503 };
  }

  const anon = createAnonClient(env);
  const { data: otp, error: otpError } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpError || !otp.session) {
    console.error("[auth:telegram-mint]", { stage: "verify_otp", code: otpError?.code, requestId: rid });
    return { ok: false, code: "AUTH_UPSTREAM", message: "Сервис авторизации временно недоступен", status: 503 };
  }

  return { ok: true, session: normalizeSession(otp.session) };
}

/** POST /api/v1/auth/login */
