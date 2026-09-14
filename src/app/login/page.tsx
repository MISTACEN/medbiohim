"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8FAFC] px-4">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-violet-300/25 blur-3xl" />

      <div className="relative w-full max-w-md overflow-hidden rounded-card border border-white/60 bg-white/80 p-8 shadow-lift backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-soft bg-brand-gradient text-white shadow-card">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Медбиохим</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в учебную платформу</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-soft border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="student@example.com" autoComplete="email" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Пароль</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-soft border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              autoComplete="current-password" />
          </div>
          {error && <p className="rounded-soft bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm text-slate-500">
          <p>
            Нет аккаунта?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">Регистрация</Link>
          </p>
          <button type="button" onClick={onLogout} className="text-xs text-slate-400 transition hover:text-slate-600">
            Очистить локальный токен
          </button>
        </div>
      </div>
    </div>
  );
}
