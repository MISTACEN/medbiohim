"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseOAuthTokensFromUrl } from "@/lib/supabase";
import { resolveLinkReturn } from "@/lib/auth/link-return";
import { setTokens } from "@/lib/api";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Завершаем вход…");

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
    const isRecovery = hashParams.get("type") === "recovery";
    const linkReturn = resolveLinkReturn(currentUrl.search);
    const parsed = parseOAuthTokensFromUrl(window.location.href);

    // OAuth-привязка Google возвращается сюда же. Ошибку провайдера показываем
    // текстом и возвращаем в настройки: «попробуйте ещё раз» без причины — враньё.
    if (linkReturn.kind === "error") {
      setStatus("error");
      setMessage(linkReturn.message);
      window.history.replaceState({}, "", "/auth/callback");
      setTimeout(() => { window.location.href = linkReturn.target; }, 1500);
      return;
    }
    if (parsed.error) {
      setStatus("error");
      setMessage(parsed.error_description || parsed.error || "Ошибка OAuth");
      return;
    }
    if (parsed.access_token) {
      // Токены из hash обмениваются на HttpOnly куки (RFC §3.3) до перехода на
      // целевую страницу: localStorage не используется, JavaScript куки не видит.
      void (async () => {
        try {
          await setTokens(parsed.access_token!, parsed.refresh_token);
        } catch {}
        setStatus("ok");
        setMessage(
          isRecovery
            ? "Сессия восстановления активна. Открываем смену пароля…"
            : linkReturn.kind === "linked"
              ? linkReturn.message
              : "Вход выполнен. Перенаправление…",
        );
        window.history.replaceState({}, "", "/auth/callback");
        const target = isRecovery ? "/settings?recovery=1" : linkReturn.kind === "linked" ? linkReturn.target : "/";
        setTimeout(() => {
          window.location.href = target;
        }, 600);
      })();
      return;
    }
    if (linkReturn.kind === "linked") {
      // Supabase может завершить привязку без токенов в URL. Не объявляем успех
      // сами: /settings заново загрузит identities и покажет фактическое состояние.
      setStatus("ok");
      setMessage(linkReturn.message);
      window.history.replaceState({}, "", "/auth/callback");
      setTimeout(() => { window.location.href = linkReturn.target; }, 400);
      return;
    }
    setStatus("error");
    setMessage(
      "Не удалось завершить вход: ссылка недействительна или уже использована. Вернитесь на страницу входа и попробуйте снова."
    );
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "#f9fafb" }}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          {status === "working" ? "Вход" : status === "ok" ? "Готово" : "Ошибка"}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
        {status === "error" && (
          <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-indigo-600 hover:underline">
            Вернуться ко входу
          </Link>
        )}
      </div>
    </div>
  );
}
