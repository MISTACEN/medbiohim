"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { clearTokens, login, setTokens } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      if (!res.ok) {
        setError(res.error.message || "Ошибка входа");
        return;
      }
      if (res.data.access_token) {
        setTokens(res.data.access_token, res.data.refresh_token);
      }
      router.push("/");
    } catch {
      setError("Не удалось связаться с API. Проверьте NEXT_PUBLIC_API_URL.");
    } finally {
      setLoading(false);
    }
  }

  function onLogout() {
    clearTokens();
    setError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#2B4C7E] text-white font-bold">
            МБ
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Медбиохим</h1>
          <p className="text-sm text-slate-500 mt-1">Вход в учебную платформу</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4C7E]"
              placeholder="student@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4C7E]"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#2B4C7E] text-white py-2.5 text-sm font-medium hover:bg-[#243f68] disabled:opacity-60"
          >
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>

        <button
          type="button"
          onClick={onLogout}
          className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          Очистить локальный токен
        </button>

        <p className="mt-6 text-center text-xs text-slate-400">
          API: login → SpaceWeb → Supabase Auth
        </p>
      </div>
    </div>
  );
}
