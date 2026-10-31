"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Field, FieldInput } from "@/components/ui/Field";
import { register, setTokens } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { startGoogleOAuth } from "@/lib/supabase";
import { describeApiError } from "@/lib/errors";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
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
      const res = await register(email.trim(), password, fullName.trim());
      if (!res.ok) {
        const msg = describeApiError(res.error) || "Ошибка регистрации";
        if (/rate limit/i.test(msg)) {
          setError("Слишком много писем за короткое время. Подождите и попробуйте снова или войдите через Google.");
        } else if (/already|registered|exists/i.test(msg)) {
          setError("Email уже зарегистрирован — войдите или используйте Google.");
        } else {
          setError(msg);
        }
        return;
      }
      const payload = res.data as any;
      const session = payload?.session ?? payload?.data?.session ?? payload?.data ?? payload;
      const accessToken = session?.access_token ?? session?.accessToken ?? payload?.access_token ?? payload?.accessToken;
      const refreshToken = session?.refresh_token ?? session?.refreshToken ?? payload?.refresh_token ?? payload?.refreshToken;
      if (typeof accessToken === "string" && accessToken.length > 0) {
        // Обмен токенов на HttpOnly куки (RFC §3.3) — до последующих запросов.
        await setTokens(accessToken, typeof refreshToken === "string" ? refreshToken : undefined);
        await refresh();
        router.replace("/");
        return;
      }
      if (payload?.needs_email_confirm || payload?.needs_email_confirmation) {
        setInfo("Аккаунт создан. Откройте письмо и подтвердите email, затем войдите.");
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
          <Field label="ФИО / Имя" required hint="Как в зачётке — видно в профиле, заданиях и рейтинге" htmlFor="reg-name">
            <FieldInput id="reg-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} placeholder="Иванов Иван Иванович" autoComplete="name" />
          </Field>
          <Field label="Email" required htmlFor="reg-email">
            <FieldInput id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Пароль" required hint="Не короче 8 символов" htmlFor="reg-password">
            <FieldInput id="reg-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Повтор пароля" required htmlFor="reg-password2">
            <FieldInput id="reg-password2" type="password" required minLength={8} value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </Field>
          {error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">{error}</div>}
          {info && <div className="rounded-xl bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">{info}</div>}
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
