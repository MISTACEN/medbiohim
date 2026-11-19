"use client";

import Link from "next/link";
import { Mail, Send } from "lucide-react";
import { startGoogleOAuth } from "@/lib/supabase";

import { METHODS } from "./loginModel";
import type { LoginFormView } from "./useLoginForm";

/** Переключатель способов входа и карточка активного способа с ошибками/уведомлениями. */
export function LoginMethodsPanel({ form }: { form: LoginFormView }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
        {METHODS.map((item) => {
          const active = form.method === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => form.setMethodWithErrorReset(item.id)}
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
        {form.method === "email" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Вход по почте</h2>
              <p className="mt-1 text-sm text-slate-500">Пароль или одноразовая ссылка — что удобнее.</p>
            </div>

            <form onSubmit={form.onSubmit} className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Email
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => form.setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--status-ok-border)] focus:ring-2 focus:ring-[var(--status-ok-border)]"
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Пароль
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => form.setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--status-ok-border)] focus:ring-2 focus:ring-[var(--status-ok-border)]"
                  autoComplete="current-password"
                />
              </label>
              <button
                type="submit"
                disabled={form.loading}
                className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
              >
                {form.loading ? "Вход…" : "Войти с паролем"}
              </button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => void form.onRecover()} disabled={form.recoverLoading} className="font-semibold text-indigo-600 hover:underline disabled:opacity-50">
                  {form.recoverLoading ? "Отправляем…" : "Забыли пароль?"}
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

            <form onSubmit={form.onMagic} className="flex gap-2">
              <input
                type="email"
                required
                value={form.magicEmail}
                onChange={(e) => form.setMagicEmail(e.target.value)}
                placeholder="email для ссылки"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[var(--status-ok-border)] focus:ring-2 focus:ring-[var(--status-ok-border)]"
              />
              <button
                type="submit"
                disabled={form.magicLoading}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--status-ok-border)] px-3 py-2.5 text-sm font-semibold text-[var(--status-ok-fg)] hover:bg-[var(--status-ok-bg)] disabled:opacity-60"
              >
                <Mail className="h-4 w-4" />
                {form.magicLoading ? "…" : "Ссылка"}
              </button>
            </form>
            <p className="text-xs text-slate-500">
              Ссылка входит в уже созданный аккаунт. Если аккаунта ещё нет —
              воспользуйтесь <Link href="/register" className="font-semibold text-[var(--status-ok-fg)]">регистрацией</Link>.
            </p>
          </div>
        )}

        {form.method === "google" && (
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

        {form.method === "telegram" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Вход через Telegram</h2>
              <p className="mt-1 text-sm text-slate-500">
                Telegram работает как самостоятельный способ входа, если аккаунт уже привязан к боту.
              </p>
            </div>
            {form.telegramBot.state === "ready" ? (
              <div className="space-y-3">
                {/* Вставка Telegram Login Widget: скрипт Telegram рендерит кнопку сам. */}
                <div id="telegram-login-container" className="flex min-h-[46px] items-center justify-center" />
                {form.telegramLoading && <p className="text-center text-sm text-slate-500">Подтверждаем вход…</p>}
              </div>
            ) : form.telegramBot.state === "loading" ? (
              <p className="text-center text-sm text-slate-500">Готовим вход через Telegram…</p>
            ) : null}
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><span className="font-bold text-[var(--status-ok-fg)]">1.</span> Нажмите кнопку выше (или откройте бота) и подтвердите вход.</li>
              <li className="flex gap-2"><span className="font-bold text-[var(--status-ok-fg)]">2.</span> Если аккаунт ещё не привязан — сначала войдите по почте или Google и привяжите Telegram в настройках.</li>
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

        {form.error && <div className="mt-4 rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">{form.error}</div>}
        {form.info && <div className="mt-4 rounded-xl bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">{form.info}</div>}
      </div>
    </>
  );
}
