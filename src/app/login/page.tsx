"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { clearTokens, login, setTokens } from "@/lib/api";
import { startGoogleOAuth } from "@/lib/supabase";

function mapLoginError(code: string, message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Неверный email или пароль. Если регистрировались через Google — войдите кнопкой Google. Или сбросьте пароль / создайте пользователя в Supabase с Auto Confirm.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Email не подтверждён. В Supabase включите Auto Confirm или подтвердите письмо.";
  }
  if (code === "AUTH_NOT_CONFIGURED") {
    return "Auth на сервере не настроен (SpaceWeb .env).";
  }
  return message || "Ошибка входа";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      clearTokens();
      const res = await login(email.trim(), password);
      if (!res.ok) {
        setError(mapLoginError(res.error.code, res.error.message));
        return;
      }
      if (res.data.access_token) {
        setTokens(res.data.access_token, res.data.refresh_token);
        window.location.href = "/";
        return;
      }
      setError("Сервер не вернул токен. Проверьте подтверждение email в Supabase.");
    } catch {
      setError("Не удалось связаться с API. Проверьте NEXT_PUBLIC_API_URL=/api/v1");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4" style={{ background: "#F8FAFC" }}>
      <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white/90 p-8 shadow-lg backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Медбиохим</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в учебную платформу</p>
        </div>

        <button
          type="button"
          onClick={() => startGoogleOAuth()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.3H12z" />
          </svg>
          Войти через Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          или email
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" autoComplete="email" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Пароль</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" autoComplete="current-password" />
          </div>
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60">
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Нет аккаунта? <Link href="/register" className="font-semibold text-blue-600 hover:underline">Регистрация</Link>
        </p>
      </div>
    </div>
  );
}
