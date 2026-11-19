"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearTokens, login, recoverPassword, setTokens } from "@/lib/api";
import { telegramWidgetConfig, telegramWidgetLogin } from "@/lib/api/auth";
import { useAuth } from "@/components/auth/AuthProvider";
import { safeNextPath } from "@/lib/navigation";
import { startMagicLink } from "@/lib/supabase";
import { describeApiError } from "@/lib/errors";

import { type LoginMethod, mapLoginError } from "./loginModel";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

/**
 * Данные и действия страницы входа: три способа входа (почта, Google,
 * Telegram), восстановление пароля и магическая ссылка. Разметка —
 * в LoginMethodsPanel и на самой странице.
 */
export function useLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  // A session that expired while the user was working comes back to the same page.
  // Read after mount so the form itself is server-rendered instead of a placeholder.
  const [nextPath, setNextPath] = useState("/");
  const [method, setMethod] = useState<LoginMethod>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [recoverLoading, setRecoverLoading] = useState(false);
  // Website "Sign in with Telegram" (Login Widget): bot username comes from the
  // API; "unavailable" falls back to the bot instructions below.
  const [telegramBot, setTelegramBot] = useState<{ state: "loading" | "ready" | "unavailable"; username: string | null }>({
    state: "loading",
    username: null,
  });
  const [telegramLoading, setTelegramLoading] = useState(false);

  const rawNext = searchParams.get("next");
  // Only same-site paths: an open redirect must never be possible here.
  useEffect(() => {
    setNextPath(safeNextPath(rawNext));
  }, [rawNext]);

  // Возврат после отмены OAuth приходит с query-причиной (/login?error=…).
  // Показываем её текстом, а не пустой страницей и не «попробуйте ещё раз».
  const oauthFailure = searchParams.get("error_description") || searchParams.get("error") || "";
  useEffect(() => {
    if (!oauthFailure) return;
    const known: Record<string, string> = {
      access_denied: "вы отменили вход у провайдера — аккаунт не изменился",
      server_error: "провайдер вернул ошибку, повторите позже",
    };
    setError(`Вход не завершён: ${known[oauthFailure] || oauthFailure}`);
  }, [oauthFailure]);

  // Public bot username for the Login Widget; 503 keeps the bot instructions.
  useEffect(() => {
    if (method !== "telegram") return;
    let cancelled = false;
    setTelegramBot({ state: "loading", username: null });
    void (async () => {
      try {
        const res = await telegramWidgetConfig();
        if (cancelled) return;
        if (res.ok && typeof res.data?.bot_username === "string" && res.data.bot_username) {
          setTelegramBot({ state: "ready", username: res.data.bot_username });
        } else {
          setTelegramBot({ state: "unavailable", username: null });
        }
      } catch {
        if (!cancelled) setTelegramBot({ state: "unavailable", username: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [method]);

  // The widget executes data-onauth in the global scope: window.onTelegramAuth
  // receives the signed payload and exchanges it for a server-issued session.
  useEffect(() => {
    if (method !== "telegram" || telegramBot.state !== "ready" || !telegramBot.username) return;
    window.onTelegramAuth = (user: Record<string, unknown>) => {
      void (async () => {
        setTelegramLoading(true);
        setError(null);
        setInfo(null);
        try {
          clearTokens();
          const res = await telegramWidgetLogin(user);
          if (!res.ok) {
            setError(
              res.error.code === "TELEGRAM_NOT_LINKED" || res.error.code === "TELEGRAM_NO_EMAIL"
                ? describeApiError(res.error)
                : mapLoginError(res.error.code, describeApiError(res.error)),
            );
            return;
          }
          const payload = res.data as any;
          if (typeof payload?.access_token === "string" && payload.access_token) {
            await setTokens(payload.access_token, typeof payload.refresh_token === "string" ? payload.refresh_token : undefined);
            await refresh();
            router.replace(nextPath);
            return;
          }
          setError(`Сервер не вернул токен входа. Код запроса: ${res.requestId || "не указан"}.`);
        } catch {
          setError("Не удалось связаться с API.");
        } finally {
          setTelegramLoading(false);
        }
      })();
    };
    const container = document.getElementById("telegram-login-container");
    if (!container || container.childElementCount > 0) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBot.username);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);
    return () => {
      delete window.onTelegramAuth;
    };
  }, [method, telegramBot, nextPath, refresh, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      clearTokens();
      const res = await login(email.trim(), password);
      if (!res.ok) {
        setError(mapLoginError(res.error.code, describeApiError(res.error)));
        return;
      }
      const payload = res.data as any;
      const session = payload?.session ?? payload?.data?.session ?? payload?.data ?? payload;
      const accessToken = session?.access_token ?? session?.accessToken ?? payload?.access_token ?? payload?.accessToken;
      const refreshToken = session?.refresh_token ?? session?.refreshToken ?? payload?.refresh_token ?? payload?.refreshToken;
      if (typeof accessToken === "string" && accessToken.length > 0) {
        // Обмен токенов на HttpOnly куки (RFC §3.3): ждём ответ сервера, чтобы
        // последующие same-origin запросы уже несли сессию.
        await setTokens(accessToken, typeof refreshToken === "string" ? refreshToken : undefined);
        // Client-side navigation: the shell and the profile state update without a reload.
        await refresh();
        router.replace(nextPath);
        return;
      }
      if (payload?.needs_email_confirm || payload?.needs_email_confirmation) {
        setError("Аккаунт ещё не подтверждён. Откройте письмо и подтвердите email, затем войдите снова.");
      } else {
        setError(`Сервер не вернул токен входа. Код запроса: ${res.requestId || "не указан"}.`);
      }
    } catch {
      setError("Не удалось связаться с API.");
    } finally {
      setLoading(false);
    }
  }

  async function onRecover() {
    const target = email.trim();
    if (!target) {
      setError("Сначала укажите email для восстановления.");
      return;
    }
    setRecoverLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await recoverPassword(target);
      if (!res.ok) {
        setError(describeApiError(res.error));
        return;
      }
      setInfo("Ссылка для восстановления пароля отправлена на почту.");
    } catch {
      setError("Не удалось отправить ссылку восстановления.");
    } finally {
      setRecoverLoading(false);
    }
  }

  async function onMagic(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setMagicLoading(true);
    try {
      const res = await startMagicLink(magicEmail.trim());
      if (!res.ok) {
        // Ссылка входит только в существующий аккаунт: Supabase отвечает
        // ошибкой на незнакомый email (SA10 — без автосоздания учётки).
        if (/signups? not allowed|not found|invalid/i.test(res.error)) {
          setError("Аккаунт с таким email не найден. Создайте его через «Регистрация».");
        } else {
          setError(res.error || "Не удалось отправить ссылку");
        }
        return;
      }
      setInfo("Ссылка для входа отправлена на почту. Откройте письмо и перейдите по ссылке.");
    } catch {
      setError("Не удалось отправить ссылку для входа.");
    } finally {
      setMagicLoading(false);
    }
  }

  return {
    method,
    setMethodWithErrorReset: (id: LoginMethod) => {
      setMethod(id);
      setError(null);
      setInfo(null);
    },
    email, setEmail, password, setPassword,
    magicEmail, setMagicEmail,
    error, info,
    loading, magicLoading, recoverLoading,
    telegramBot, telegramLoading,
    onSubmit, onRecover, onMagic,
  };
}

export type LoginFormView = ReturnType<typeof useLoginForm>;
