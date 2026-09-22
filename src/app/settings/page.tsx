"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  Check, Link2, Unlink, Mail, KeyRound, Shield, RefreshCw, Bell, Globe2, Sparkles,
} from "lucide-react";
import { THEMES, useTheme, type AppThemeId } from "@/components/theme/ThemeProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  changeAccountPassword,
  getAccountSettings,
  saveAccountPreferences,
  startLinkIdentity,
  unlinkIdentity,
  updateAccountProfile,
  type AccountSettings,
  type LinkedIdentity,
} from "@/lib/settings-api";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, refresh } = useAuth();

  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const referenceThemes = THEMES.filter((t) => (t as { family?: string }).family === "reference");
  const otherThemes = THEMES.filter((t) => (t as { family?: string }).family !== "reference");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const r = await getAccountSettings();
    if (r.ok) {
      setAccount(r.data);
      const u = r.data.user || {};
      setFullName(String(u.full_name || user?.name || ""));
      setEmail(String(u.email || user?.email || ""));
    } else {
      setErr(r.error.message);
      setFullName(user?.name || "");
      setEmail(user?.email || "");
    }
    setLoading(false);
  }, [user?.name, user?.email]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("linked") === "1" || q.get("link") === "ok") {
      setMsg("Провайдер привязан. Данные остаются на том же аккаунте.");
      void load();
      window.history.replaceState({}, "", "/settings");
    }
  }, [load]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy("profile"); setMsg(null); setErr(null);
    const r = await updateAccountProfile({ full_name: fullName.trim() || undefined, email: email.trim() || undefined });
    setBusy(null);
    if (!r.ok) return setErr(r.error.message);
    setAccount(r.data);
    setMsg("Профиль сохранён");
    if (refresh) void refresh();
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setErr("Пароль не короче 8 символов");
    if (password !== password2) return setErr("Пароли не совпадают");
    setBusy("password"); setErr(null);
    const r = await changeAccountPassword(password);
    setBusy(null);
    if (!r.ok) return setErr(r.error.message);
    setPassword(""); setPassword2(""); setMsg("Пароль обновлён");
  }

  async function onLink(provider: string) {
    setBusy("link-" + provider); setErr(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "https://medbiohim.vercel.app";
    const r = await startLinkIdentity(provider, `${origin}/settings?linked=1`);
    setBusy(null);
    if (!r.ok) return setErr(r.error.message);
    if (r.data.url) window.location.href = r.data.url;
    else setErr("Нет URL для привязки");
  }

  async function onUnlink(id: LinkedIdentity) {
    if (!id.can_unlink) return setErr("Нельзя отвязать единственный способ входа");
    if (!confirm(`Отвязать ${id.provider_label}?`)) return;
    setBusy("unlink-" + id.id);
    const r = await unlinkIdentity(id.id);
    setBusy(null);
    if (!r.ok) return setErr(r.error.message);
    setAccount(r.data);
    setMsg(`${id.provider_label} отвязан`);
  }

  async function togglePref(key: string, value: boolean) {
    const r = await saveAccountPreferences({ [key]: value });
    if (!r.ok) return setErr(r.error.message);
    setAccount((prev) => prev ? { ...prev, preferences: { ...prev.preferences, ...r.data.preferences } } : prev);
  }

  const identities = account?.identities || [];
  const linkedProviders = new Set(identities.map((i) => i.provider));
  const prefs = account?.preferences || {};

  const renderTheme = (t: (typeof THEMES)[number]) => {
    const active = theme === t.id;
    return (
      <button key={t.id} type="button" onClick={() => { setTheme(t.id as AppThemeId); void saveAccountPreferences({ theme: t.id }); }}
        className={clsx("group relative overflow-hidden rounded-3xl border p-4 text-left transition", active ? "ring-2 ring-offset-2" : "hover:-translate-y-0.5")}
        style={{ borderColor: active ? "var(--primary)" : "var(--border)", background: "color-mix(in srgb, var(--card) 88%, var(--background))", color: "var(--text)", ["--tw-ring-color" as string]: "var(--primary)" }}>
        {active && (
          <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}>
            <Check className="h-4 w-4" />
          </span>
        )}
        <div className="relative mb-4 h-28 overflow-hidden rounded-2xl border" style={{ background: (t as { preview?: string }).preview || "linear-gradient(135deg,#2563eb,#60a5fa)", borderColor: "color-mix(in srgb,var(--primary) 16%,transparent)" }} />
        <div className="font-bold">{t.label}</div>
        <div className="mt-1 text-xs leading-5 opacity-70">{t.description}</div>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-subtitle">Один аккаунт · почта / Google / VK · темы и уведомления</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} /> Обновить
        </button>
      </div>

      {(msg || err) && (
        <div className={clsx("rounded-xl border px-4 py-3 text-sm", err ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
          {err || msg}
        </div>
      )}

      <section className="card space-y-2 border-l-4 border-l-[var(--primary)] p-5">
        <div className="flex items-center gap-2 font-semibold"><Shield className="h-5 w-5 text-[var(--primary)]" /> Единый аккаунт</div>
        <p className="text-sm text-[var(--muted)]">{String(account?.sync?.note || "Прогресс, SRS и задания привязаны к одному ID. Привязка Google/VK не создаёт второй профиль.")}</p>
        {account?.sync?.account_id ? <div className="font-mono text-xs text-[var(--muted)]">ID: {String(account.sync.account_id)}</div> : null}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Mail className="h-5 w-5" /> Профиль</h2>
        <form onSubmit={onSaveProfile} className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Имя</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
          <button type="submit" disabled={busy === "profile"} className="btn-primary disabled:opacity-60">{busy === "profile" ? "…" : "Сохранить профиль"}</button>
        </form>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5" /> Пароль</h2>
        <form onSubmit={onChangePassword} className="space-y-3">
          <input type="password" placeholder="Новый пароль" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" autoComplete="new-password" />
          <input type="password" placeholder="Повтор" value={password2} onChange={(e) => setPassword2(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" autoComplete="new-password" />
          <button type="submit" disabled={busy === "password"} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold">Сменить пароль</button>
        </form>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" /> Привязанные входы</h2>
        <p className="text-sm text-[var(--muted)]">Почта, Google, VK и Telegram — к одному аккаунту. VK удобнее без VPN; Google может потребовать VPN в браузере.</p>
        <div className="space-y-2">
          {identities.map((id) => (
            <div key={id.id || id.provider} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-4 py-3">
              <div>
                <div className="font-semibold">{id.provider_label}</div>
                <div className="text-xs text-[var(--muted)]">{[id.email, id.name].filter(Boolean).join(" · ") || id.provider}</div>
              </div>
              <button type="button" disabled={!id.can_unlink} onClick={() => void onUnlink(id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40">
                <Unlink className="h-3.5 w-3.5" /> Отвязать
              </button>
            </div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(account?.providers_available || [
            { id: "google", label: "Google", region: "global", enabled: true, linkable: true },
            { id: "custom:vk", label: "ВКонтакте", region: "ru", enabled: true, linkable: true },
            { id: "custom:telegram", label: "Telegram", region: "any", enabled: true, linkable: true },
          ]).filter((p) => p.linkable).map((p) => {
            const linked = linkedProviders.has(p.id);
            return (
              <button key={p.id} type="button" disabled={linked || !p.enabled || !!busy} onClick={() => void onLink(p.id)}
                className={clsx("rounded-xl border px-4 py-3 text-left text-sm", linked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-[var(--border)]")}>
                <div className="font-semibold">{linked ? "✓ " : "+ "}{p.label}</div>
                <div className="text-xs text-[var(--muted)]">{linked ? "Уже привязан" : p.region === "ru" ? "Без VPN в РФ" : "Может нужен VPN"}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Bell className="h-5 w-5" /> Уведомления и медиа</h2>
        <div className="space-y-3 text-sm">
          {([["notify_homework", "Напоминания о заданиях"], ["notify_lectures", "Новые лекции"], ["notify_email", "Письма на email"], ["media_prefer_ru", "Сначала видео без VPN"]] as [string, string][]).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
              <span>{label}</span>
              <input type="checkbox" checked={Boolean(prefs[key] ?? true)} onChange={(e) => void togglePref(key, e.target.checked)} className="h-4 w-4" />
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Globe2 className="h-3.5 w-3.5" /> Язык: русский</div>
      </section>

      {referenceThemes.length > 0 && (
        <section className="card space-y-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}>
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Темы из макетов</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Стекло, градиенты, медицинский индиго</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">{referenceThemes.map(renderTheme)}</div>
        </section>
      )}

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Классические темы</h2>
        <div className="grid gap-3 md:grid-cols-3">{(otherThemes.length ? otherThemes : THEMES).map(renderTheme)}</div>
      </section>
    </div>
  );
}
