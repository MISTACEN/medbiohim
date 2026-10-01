"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { register, setTokens } from "@/lib/api";
import { startGoogleOAuth } from "@/lib/supabase";

export default function RegisterPage() {
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
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("Укажите ФИО / имя (не короче 2 символов)");
      return;
    }
    if (password !== password2) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setError("Пароль не короче 8 символов");
      return;
    }
    setLoading(true);
    try {
      const res = await register({ email: email.trim(), password, full_name: fullName.trim() });
      if (!res.ok) {
        const msg = res.error.message || "Ошибка регистрации";
        if (/rate limit/i.test(msg)) {
          setError("Лимит Supabase на письма. Подождите или войдите через Google / Auto Confirm в Dashboard.");
        } else if (/already|registered|exists/i.test(msg)) {
          setError("Email уже зарегистрирован — войдите или используйте Google.");
        } else {
          setError(msg);
        }
        return;
      }
      if (res.data.access_token) {
        setTokens(res.data.access_token, res.data.refresh_token || undefined);
        window.location.href = "/";
        return;
      }
      if (res.data.needs_email_confirm) {
        setInfo("Аккаунт создан. Подтвердите email или включите Auto Confirm в Supabase, затем войдите.");
        return;
      }
      setInfo("Регистрация принята. Попробуйте войти.");
    } catch {
      setError("Не удалось связаться с API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4" style={{ background: "#F8FAFC" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/90 p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Регистрация</h1>
          <p className="text-sm text-slate-500">Создание аккаунта студента</p>
        </div>

        <button type="button" onClick={() => startGoogleOAuth()} className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
          Продолжить с Google
        </button>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ФИО / Имя <span className="text-rose-500">*</span>
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              placeholder="Иванов Иван Иванович"
              autoComplete="name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">Как в зачётке — видно в профиле, заданиях и рейтинге</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email <span className="text-rose-500">*</span></label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" autoComplete="email" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Пароль <span className="text-rose-500">*</span></label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" autoComplete="new-password" />
            <p className="mt-1 text-xs text-slate-500">Не короче 8 символов</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Повтор пароля <span className="text-rose-500">*</span></label>
            <input type="password" required minLength={8} value={password2} onChange={(e) => setPassword2(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" autoComplete="new-password" />
          </div>
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {info && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? "Создание…" : "Создать аккаунт"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Уже есть аккаунт? <Link href="/login" className="font-semibold text-blue-600">Войти</Link>
        </p>
      </div>
    </div>
  );
}
