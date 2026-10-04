"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseOAuthTokensFromUrl } from "@/lib/supabase";
import { setTokens } from "@/lib/api";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Завершаем вход…");

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
    const isRecovery = hashParams.get("type") === "recovery";
    const parsed = parseOAuthTokensFromUrl(window.location.href);
    if (parsed.error) {
      setStatus("error");
      setMessage(parsed.error_description || parsed.error || "Ошибка OAuth");
      return;
    }
    if (parsed.access_token) {
      setTokens(parsed.access_token, parsed.refresh_token);
      setStatus("ok");
      setMessage(isRecovery ? "Сессия восстановления активна. Открываем смену пароля…" : "Вход выполнен. Перенаправление…");
      window.history.replaceState({}, "", "/auth/callback");
      setTimeout(() => {
        window.location.href = isRecovery ? "/settings?recovery=1" : "/";
      }, 600);
      return;
    }
    setStatus("error");
    setMessage(
      "Токен не получен. В Supabase → Authentication → URL Configuration добавьте Redirect: https://medbiohim.vercel.app/auth/callback"
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
