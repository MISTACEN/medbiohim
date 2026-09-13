"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register, setTokens } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password !== password2) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 6) {
      setError("Пароль не короче 6 символов");
      return;
    }
    setLoading(true);
    try {
      const res = await register(email, password, fullName || undefined);
      if (!res.ok) {
        setError(res.error.message || "Ошибка регистрации");
        return;
      }
      if (res.data.access_token) {
        setTokens(res.data.access_token, res.data.refresh_token || undefined);
        router.push("/");
        return;
      }
      if (res.data.needs_email_confirm) {
        setInfo("Аккаунт создан. Подтвердите email (если включено в Supabase), затем войдите.");
        return;
      }
      setInfo("Регистрация прошла успешно. Войдите в аккаунт.");
    } catch {
      setError("Не удалось связаться с API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-card border border-slate-200/80 bg-white p-8 shadow-soft">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-soft bg-brand-gradient font-bold text-white shadow-card">
            МБ
          </div>
          <h1 className="text-xl font-bold text-slate-900">Регистрация</h1>
          <p className="mt-1 text-sm text-slate-500">Создание аккаунта студента</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">ФИО</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-soft border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Иванов Иван" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-soft border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Пароль</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-soft border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Повтор пароля</label>
            <input type="password" required value={password2} onChange={(e) => setPassword2(e.target.value)} className="w-full rounded-soft border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {error && <p className="rounded-soft bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {info && <p className="rounded-soft bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "Создание…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  );
}
