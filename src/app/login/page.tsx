"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Send, Shield } from "lucide-react";
import { clearTokens, login, recoverPassword, setTokens } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { safeNextPath } from "@/lib/navigation";
import { startGoogleOAuth, startMagicLink } from "@/lib/supabase";
import { describeApiError } from "@/lib/errors";

type LoginMethod = "email" | "google" | "telegram";

const METHODS: Array<{ id: LoginMethod; title: string; hint: string }> = [
  { id: "email", title: "Почта", hint: "Пароль или ссылка" },
  { id: "google", title: "Google", hint: "Один клик" },
  { id: "telegram", title: "Telegram", hint: "Через бота" },
];

function mapLoginError(code: string, message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Неверный email или пароль. Если регистрировались через Google — войдите кнопкой Google.";
  }
  if (code === "EMAIL_NOT_CONFIRMED" || m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Email не подтверждён. Проверьте письмо или войдите через Google.";
  }
  if (code === "AUTH_NOT_CONFIGURED") {
    return "Вход временно недоступен: сервер авторизации не настроен.";
  }
  return message || "Ошибка входа";
}

function LoginPageInner() {
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
        setTokens(accessToken, typeof refreshToken === "string" ? refreshToken : undefined);
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

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{ background: "linear-gradient(180deg, #f0f7f4 0%, #f8fafc 55%, #eef2ff 100%)" }}
    >
      <div className="relative w-full max-w-lg space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-white shadow-md">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Медбиохим</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в учебную платформу</p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
          {METHODS.map((item) => {
            const active = method === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMethod(item.id);
                  setError(null);
                  setInfo(null);
                }}
                className={
                  "rounded-xl px-3 py-2 text-center transition " +
                  (active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")
                }
              >
                <span className="block text-sm font-bold">{item.title}</span>
                <span className={"mt-0.5 block text-[11px] " + (active ? "text-slate-300" : "text-slate-400")}>
                  {item.hint}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-sm sm:p-6">
          {method === "email" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Вход по почте</h2>
                <p className="mt-1 text-sm text-slate-500">Пароль или одноразовая ссылка — что удобнее.</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Пароль
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    autoComplete="current-password"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                >
                  {loading ? "Вход…" : "Войти с паролем"}
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={() => void onRecover()} disabled={recoverLoading} className="font-semibold text-indigo-600 hover:underline disabled:opacity-50">
                    {recoverLoading ? "Отправляем…" : "Забыли пароль?"}
                  </button>
                  <Link href="/register" className="font-semibold text-slate-500 hover:underline">
                    Создать аккаунт
                  </Link>
                </div>
              </form>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-100" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">или без пароля</span>
                <span className="h-px flex-1 bg-slate-100" />
              </div>

              <form onSubmit={onMagic} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  placeholder="email для ссылки"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="submit"
                  disabled={magicLoading}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-600 px-3 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                >
                  <Mail className="h-4 w-4" />
                  {magicLoading ? "…" : "Ссылка"}
                </button>
              </form>
              <p className="text-xs text-slate-500">
                Ссылка входит в уже созданный аккаунт. Если аккаунта ещё нет —
                воспользуйтесь <Link href="/register" className="font-semibold text-emerald-700">регистрацией</Link>.
              </p>
            </div>
          )}

          {method === "google" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Вход через Google</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Подойдёт личный или университетский Google-аккаунт. Пароль от Google сайт не видит.
                </p>
              </div>
              <button
                type="button"
                onClick={() => startGoogleOAuth()}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-[#4285F4]">G</span>
                Продолжить с Google
              </button>
              <p className="text-xs leading-relaxed text-slate-500">
                После входа вы можете привязать Telegram в настройках — и заходить из бота без почты и пароля.
              </p>
            </div>
          )}

          {method === "telegram" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Вход через Telegram</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Telegram работает как самостоятельный способ входа, если аккаунт уже привязан к боту.
                </p>
              </div>
              <ol className="space-y-2 text-sm text-slate-600">
                <li className="flex gap-2"><span className="font-bold text-emerald-700">1.</span> Откройте бота и нажмите «Войти на сайт».</li>
                <li className="flex gap-2"><span className="font-bold text-emerald-700">2.</span> Бот пришлёт защищённую ссылку на эту платформу.</li>
                <li className="flex gap-2"><span className="font-bold text-emerald-700">3.</span> Если аккаунт ещё не привязан — сначала войдите по почте или Google и привяжите Telegram в настройках.</li>
              </ol>
              <a
                href="https://t.me/MEDBIOCHIM_bot"
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#229ED9] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#1e8fc4]"
              >
                <Send className="h-4 w-4" />
                Открыть бота MEDBIOCHIM
              </a>
              <p className="text-xs leading-relaxed text-slate-500">
                Внутри Telegram также работает Mini App: тесты и билеты открываются прямо в мессенджере.
              </p>
            </div>
          )}

          {error && <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {info && <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>}
        </div>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          Доступны только три способа входа: почта, Google и Telegram. Другие сервисы не используются.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginPageInner />
    </Suspense>
  );
}
