"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ChevronDown, Mail, Shield } from "lucide-react";
import { clearTokens, login, recoverPassword, setTokens } from "@/lib/api";
import { startGoogleOAuth, startMagicLink, startVkOAuth } from "@/lib/supabase";

function mapLoginError(code: string, message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Неверный email или пароль. Если регистрировались через Google — войдите кнопкой Google.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Email не подтверждён. Проверьте письмо или используйте Google / magic-link.";
  }
  if (code === "AUTH_NOT_CONFIGURED") {
    return "Auth на сервере не настроен (SpaceWeb .env).";
  }
  return message || "Ошибка входа";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [othersOpen, setOthersOpen] = useState(true);
  const [recoverLoading, setRecoverLoading] = useState(false);


  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
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
      setError("Не удалось связаться с API.");
    } finally {
      setLoading(false);
    }
  }

  async function onRecover() {
    const target = email.trim();
    if (!target) { setError("Сначала укажите email для восстановления."); return; }
    setRecoverLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await recoverPassword(target);
      if (!res.ok) { setError(res.error.message); return; }
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
        setError(res.error || "Не удалось отправить ссылку");
        return;
      }
      setInfo("Ссылка для входа отправлена на почту. Откройте письмо и перейдите по ссылке.");
    } catch {
      setError("Не удалось отправить magic-link");
    } finally {
      setMagicLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{ background: "linear-gradient(180deg, #f0f7f4 0%, #f8fafc 55%, #eef2ff 100%)" }}
    >
      <div className="relative w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-white shadow-md">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Медбиохим</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в учебную платформу · один клик</p>
        </div>

        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/90 p-5 shadow-sm">
          <div className="mb-2 font-bold text-slate-900">Telegram для вашего аккаунта</div>
          <p className="text-sm leading-relaxed text-slate-600">
            Сначала войдите через Google или почту. Затем откройте Настройки → Telegram и привяжите бота. После завершения безопасного серверного входа Telegram станет самостоятельным способом входа в тот же аккаунт.
          </p>
          <a
            href="https://t.me/MEDBIOCHIM_bot"
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center rounded-2xl border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            Открыть бота MEDBIOHIM →
          </a>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-sm">
          <button
            type="button"
            onClick={() => setOthersOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-slate-700"
          >
            Другие способы входа
            <ChevronDown className={`h-4 w-4 transition ${othersOpen ? "rotate-180" : ""}`} />
          </button>

          {othersOpen && (
            <div className="space-y-5 border-t border-slate-100 px-5 pb-5 pt-4">
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">
                    G
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Google</div>
                    <p className="text-xs text-slate-500">Подтверждение через окно Google.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startGoogleOAuth()}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Войти
                </button>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0077FF] text-xs font-bold text-white">
                    VK
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">ВКонтакте</div>
                    <p className="text-xs text-slate-500">Быстрее, чем писать email.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startVkOAuth()}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Войти
                </button>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Ссылка на почту</div>
                    <p className="text-xs text-slate-500">
                      Пришлём magic-link — кликните и войдёте без пароля.
                    </p>
                  </div>
                </div>
                <form onSubmit={onMagic} className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="submit"
                    disabled={magicLoading}
                    className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {magicLoading ? "…" : "Отправить"}
                  </button>
                </form>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Email и пароль
                </p>
                <form onSubmit={onSubmit} className="space-y-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    autoComplete="email"
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Пароль"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                  >
                    {loading ? "Вход…" : "Войти с паролем"}
                  </button>
                  <button type="button" onClick={() => void onRecover()} disabled={recoverLoading} className="text-left text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50">{recoverLoading ? "Отправляем ссылку…" : "Забыли пароль?"}</button>
                </form>
              </div>

              {error && (
                <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
              )}
              {info && (
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-sm text-slate-500">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-semibold text-emerald-700 hover:underline">
            Регистрация
          </Link>
        </p>
      </div>
    </div>
  );
}
