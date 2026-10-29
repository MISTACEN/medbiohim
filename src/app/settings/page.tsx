"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";

import clsx from "clsx";
import {
  Check, Link2, Unlink, Mail, KeyRound, Shield, RefreshCw, Bell, Globe2, Sparkles, Send,
  MonitorSmartphone, LogOut,
} from "lucide-react";
import { THEMES, useTheme, type AppThemeId } from "@/components/theme/ThemeProvider";
import { describeApiError } from "@/lib/errors";
import { deleteAvatar, forgetAvatar, getAvatarUrl, uploadAvatar } from "@/lib/api";
import { describeLastSeen, describeUserAgent } from "@/lib/device";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  changeAccountPassword,
  getAccountSettings,
  resendEmailChange,
  saveAccountPreferences,
  startLinkIdentity,
  unlinkIdentity,
  updateAccountProfile,
  startTelegramLink, getTelegramLinkStatus, unlinkTelegramAccount,
  listActiveSessions, revokeActiveSession, revokeOtherSessions,
  type TelegramLinkStatus,
  type AccountSettings,
  type LinkedIdentity,
  type ActiveSession,
} from "@/lib/settings-api";

type TrainerLayout = "sidebar" | "list" | "top";

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { user, refresh } = useAuth();
  const [recoveryMode, setRecoveryMode] = useState(false);

  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPending, setEmailPending] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [trainerLayout, setTrainerLayout] = useState<TrainerLayout>("top");
  const [telegramStatus, setTelegramStatus] = useState<TelegramLinkStatus | null>(null);
  // SA3: превью аватара — object URL для загруженного файла или внешний https.
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  // SA4: активные устройства. null — ещё не загружали, [] — сессий нет.
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsBusy, setSessionsBusy] = useState<string | null>(null);

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
      setEmailPending(String(u.email_change_pending || ""));
      const savedLayout = String(r.data.preferences?.trainer_layout || "top");
      if (savedLayout === "sidebar" || savedLayout === "list" || savedLayout === "top") setTrainerLayout(savedLayout);
    } else {
      setErr(describeApiError(r.error));
      setFullName(user?.name || "");
      setEmail(user?.email || "");
    }
    const tg = await getTelegramLinkStatus();
    if (tg.ok) setTelegramStatus(tg.data);
    setLoading(false);
  }, [user?.name, user?.email]);

  useEffect(() => { void load(); }, [load]);

  // Превью аватара: приоритет у загруженного файла (приватный прокси), иначе
  // внешний https-адрес из профиля (например, Google). Ошибку сети не показываем
  // баннером — просто остаются инициалы.
  useEffect(() => {
    let cancelled = false;
    const userId = String(account?.user?.id || user?.id || "");
    const external = String(account?.user?.avatar_url || "");
    const uploaded = Boolean(account?.user?.has_uploaded_avatar);
    if (!uploaded) {
      setAvatarPreview(/^https:\/\//i.test(external) ? external : null);
      return () => { cancelled = true; };
    }
    if (!userId) return () => { cancelled = true; };
    void getAvatarUrl(userId).then((url) => {
      if (!cancelled && url) setAvatarPreview(url);
    });
    return () => { cancelled = true; };
  }, [account?.user?.id, account?.user?.avatar_url, account?.user?.has_uploaded_avatar, user?.id]);

  // Сервер сам сообщает, доступна ли загрузка: без хранилища кнопка вела бы в
  // честный 502. Старый ответ без поля считаем доступным (fail-open на UI).
  const avatarUploadEnabled = account?.user?.avatar_upload_enabled !== false;

  async function onAvatarPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setErr("Аватар может быть только JPEG, PNG или WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr("Размер аватара — не больше 2 МБ");
      return;
    }
    setAvatarBusy(true); setErr(null); setMsg(null);
    const r = await uploadAvatar(file);
    if (!r.ok) {
      setAvatarBusy(false);
      return setErr(describeApiError(r.error));
    }
    // Файл загружен сервером; перечитываем аккаунт, чтобы взять новый ключ,
    // а не показывать optimistic-состояние.
    forgetAvatar();
    await load();
    setAvatarBusy(false);
    setMsg("Аватар обновлён");
    if (refresh) void refresh();
  }

  async function onAvatarRemove() {
    setAvatarBusy(true); setErr(null); setMsg(null);
    const r = await deleteAvatar();
    if (!r.ok) {
      setAvatarBusy(false);
      // 404 значит «уже нет загруженного» — это не ошибка для пользователя.
      if (String((r.error as { code?: string }).code || "") === "NOT_FOUND") {
        await load();
        return setMsg("Загруженного аватара нет");
      }
      return setErr(describeApiError(r.error));
    }
    forgetAvatar();
    await load();
    setAvatarBusy(false);
    setMsg("Аватар удалён");
    if (refresh) void refresh();
  }

  // SA4: список устройств. Ошибка не прячется за пустым списком — иначе
  // пользователь решит, что сессий нет, хотя сервер их не отдал.
  const loadSessions = useCallback(async () => {
    setSessionsError(null);
    const r = await listActiveSessions();
    if (r.ok) {
      setSessions(r.data.sessions);
    } else {
      setSessions([]);
      setSessionsError(describeApiError(r.error));
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function onRevokeSession(sessionId: string) {
    setSessionsBusy(sessionId); setErr(null); setMsg(null);
    const r = await revokeActiveSession(sessionId);
    setSessionsBusy(null);
    if (!r.ok) {
      const code = String((r.error as { code?: string }).code || "");
      if (code === "NOT_FOUND") {
        // Сессия уже истекла сама — это не ошибка, список просто устарел.
        await loadSessions();
        return setMsg("Устройство уже завершено");
      }
      return setErr(describeApiError(r.error));
    }
    await loadSessions();
    setMsg("Устройство завершено: для входа на нём потребуется пароль");
  }

  async function onRevokeOtherSessions() {
    setSessionsBusy("others"); setErr(null); setMsg(null);
    const r = await revokeOtherSessions();
    setSessionsBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    await loadSessions();
    setMsg(r.data.revoked > 0
      ? `Завершено устройств: ${r.data.revoked}. Текущее устройство осталось в аккаунте.`
      : "Других активных устройств не было");
  }

  const recoveryFromQuery = searchParams.get("recovery") === "1";
  const linkedFromQuery = searchParams.get("linked") === "1" || searchParams.get("link") === "ok";

  useEffect(() => {
    if (recoveryFromQuery) setRecoveryMode(true);
    if (linkedFromQuery) {
      setMsg("Провайдер привязан. Данные остаются на том же аккаунте.");
      void load();
      window.history.replaceState({}, "", "/settings");
    }
  }, [recoveryFromQuery, linkedFromQuery, load]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy("profile"); setMsg(null); setErr(null);
    const r = await updateAccountProfile({ full_name: fullName.trim() || undefined, email: email.trim() || undefined });
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    setAccount(r.data);
    const pending = String(r.data?.user?.email_change_pending || "");
    setEmailPending(pending);
    // Supabase меняет адрес только после перехода по ссылке из письма:
    // рапортовать «сохранено» до подтверждения — врать пользователю.
    setMsg(
      pending
        ? `Письмо с подтверждением отправлено на ${pending}. Адрес изменится после перехода по ссылке из письма.`
        : "Профиль сохранён"
    );
    if (refresh) void refresh();
  }

  async function onResendEmailChange() {
    setBusy("email-resend"); setErr(null);
    const r = await resendEmailChange();
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    setMsg(`Письмо отправлено повторно на ${r.data.pending_email || emailPending}`);
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!currentPassword) return setErr("Укажите текущий пароль");
    if (password.length < 8) return setErr("Пароль не короче 8 символов");
    if (password !== password2) return setErr("Пароли не совпадают");
    if (password === currentPassword) return setErr("Новый пароль совпадает с текущим");
    setBusy("password"); setErr(null); setMsg(null);
    const r = await changeAccountPassword(password, currentPassword);
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    setCurrentPassword(""); setPassword(""); setPassword2("");
    setMsg(
      r.data.sessions_revoked
        ? "Пароль обновлён. Остальные устройства вышли из аккаунта — на них нужно войти заново."
        : "Пароль обновлён. Если вы входили с других устройств, смените пароль ещё раз после выхода на них."
    );
  }

  async function onLink(provider: string) {
    setBusy("link-" + provider); setErr(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "https://medbiohim.vercel.app";
    const r = await startLinkIdentity(provider, `${origin}/settings?linked=1`);
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    if (r.data.url) window.location.href = r.data.url;
    else setErr("Нет URL для привязки");
  }

  async function onStartTelegramLink() {
    setBusy("telegram-link"); setErr(null); setMsg(null);
    const r = await startTelegramLink();
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    window.location.href = r.data.url;
  }

  async function onUnlinkTelegram() {
    if (!confirm("Отвязать Telegram от этого аккаунта MEDBIOHIM?")) return;
    setBusy("telegram-unlink"); setErr(null);
    const r = await unlinkTelegramAccount();
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    const status = await getTelegramLinkStatus();
    if (status.ok) setTelegramStatus(status.data);
    setMsg("Telegram отвязан");
  }

  async function onUnlink(id: LinkedIdentity) {
    if (!id.can_unlink) return setErr("Нельзя отвязать единственный способ входа");
    if (!confirm(`Отвязать ${id.provider_label}?`)) return;
    setBusy("unlink-" + id.id);
    const r = await unlinkIdentity(id.id);
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    setAccount(r.data);
    setMsg(`${id.provider_label} отвязан`);
  }

  async function togglePref(key: string, value: boolean) {
    const r = await saveAccountPreferences({ [key]: value });
    if (!r.ok) return setErr(describeApiError(r.error));
    setAccount((prev) => prev ? { ...prev, preferences: { ...prev.preferences, ...r.data.preferences } } : prev);
  }

  const ALLOWED_PROVIDERS = new Set(["email", "google", "custom:telegram", "telegram"]);
  const identities = (account?.identities || []).filter((item) => ALLOWED_PROVIDERS.has(String(item.provider)));
  const linkedProviders = new Set(identities.map((i) => i.provider));
  const providerCatalog = (account?.providers_available?.length
    ? account.providers_available
    : [
        { id: "email", label: "Почта", region: "global", enabled: true, linkable: false },
        { id: "google", label: "Google", region: "global", enabled: true, linkable: true },
        { id: "custom:telegram", label: "Telegram", region: "global", enabled: true, linkable: false },
      ]
  ).filter((item) => ALLOWED_PROVIDERS.has(item.id));
  const googleProvider = providerCatalog.find((item) => item.id === "google");
  const emailIdentity = identities.find((item) => item.provider === "email");
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
          <p className="page-subtitle">Один аккаунт · почта / Google / Telegram · темы и уведомления</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} /> Обновить
        </button>
      </div>

      {recoveryMode && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"><b>Восстановление пароля.</b> Сессия подтверждена. Задайте новый пароль ниже.</div>}

      {(msg || err) && (
        <div className={clsx("rounded-xl border px-4 py-3 text-sm", err ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
          {err || msg}
        </div>
      )}

      <section className="card space-y-3 border-l-4 border-l-[var(--primary)] p-5">
        <div className="flex items-center gap-2 font-semibold"><Shield className="h-5 w-5 text-[var(--primary)]" /> Единый аккаунт</div>
        <p className="text-sm text-[var(--muted)]">{String(account?.sync?.note || "Прогресс, SRS и задания привязаны к одному ID. Привязка Google или Telegram не создаёт второй профиль.")}</p>
        {account?.sync?.account_id ? <div className="font-mono text-xs text-[var(--muted)]">ID: {String(account.sync.account_id)}</div> : null}
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            {
              key: "email",
              title: "Почта",
              icon: <Mail className="h-4 w-4" />,
              active: Boolean(emailIdentity || account?.user?.email || user?.email),
              detail: String(emailIdentity?.email || account?.user?.email || user?.email || "не указана"),
            },
            {
              key: "google",
              title: "Google",
              icon: <span className="text-sm font-black text-[#4285F4]">G</span>,
              active: linkedProviders.has("google"),
              detail: linkedProviders.has("google") ? "привязан" : "не привязан",
            },
            {
              key: "telegram",
              title: "Telegram",
              icon: <Send className="h-4 w-4" />,
              active: Boolean(telegramStatus?.linked),
              detail: telegramStatus?.linked
                ? (telegramStatus.account?.username ? "@" + telegramStatus.account.username : "привязан")
                : "не привязан",
            },
          ].map((item) => (
            <div key={item.key} className={clsx("rounded-xl border px-3 py-2.5", item.active ? "border-emerald-200 bg-emerald-50" : "border-[var(--border)]")}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {item.icon}
                {item.title}
                {item.active && <Check className="ml-auto h-3.5 w-3.5 text-emerald-600" />}
              </div>
              <div className="mt-1 truncate text-xs text-[var(--muted)]">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Mail className="h-5 w-5" /> Профиль</h2>
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-bold text-white"
            style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}
            aria-hidden={avatarPreview ? undefined : true}
          >
            {avatarPreview
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarPreview} alt="Аватар" className="h-full w-full object-cover" />
              : String(String(fullName || user?.name || "?").trim().charAt(0) || "?").toUpperCase()}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="text-xs text-[var(--muted)]">JPEG, PNG или WebP, до 2 МБ.</div>
            <div className="flex flex-wrap items-center gap-2">
              {avatarUploadEnabled ? (
                <label className={clsx(
                  "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold",
                  avatarBusy && "pointer-events-none opacity-60"
                )}>
                  {avatarBusy ? "Загрузка…" : avatarPreview ? "Заменить фото" : "Загрузить фото"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onAvatarPick(e)} disabled={avatarBusy} />
                </label>
              ) : null}
              {account?.user?.has_uploaded_avatar && avatarUploadEnabled ? (
                <button
                  type="button"
                  onClick={() => void onAvatarRemove()}
                  disabled={avatarBusy}
                  className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                >
                  Удалить фото
                </button>
              ) : null}
            </div>
            {account?.user?.avatar_url && !account?.user?.has_uploaded_avatar ? (
              <div className="text-xs text-[var(--muted)]">
                Сейчас показывается внешний аватар из{" "}
                {String((account.user as { provider_hint?: string }).provider_hint || "подключённого сервиса")}.
                {avatarUploadEnabled ? " Загрузка своего фото заменит его." : ""}
              </div>
            ) : null}
            {!avatarUploadEnabled ? (
              <div className="text-xs text-[var(--muted)]">
                Загрузка своего фото временно недоступна: файловое хранилище не настроено на сервере.
              </div>
            ) : null}
          </div>
        </div>
        <form onSubmit={onSaveProfile} className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Имя</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
          <div className="block text-sm">
            <label htmlFor="settings-email" className="mb-1 block text-xs text-[var(--muted)]">Email</label>
            <input id="settings-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            {emailPending ? (
              <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="font-semibold">Адрес {emailPending} ждёт подтверждения</div>
                <p className="mt-1 leading-relaxed">
                  Пока вы не перейдёте по ссылке из письма, вход остаётся на{" "}
                  {String(account?.user?.email || user?.email || "текущий адрес")}. Если письма нет — проверьте «Спам».
                </p>
                <button
                  type="button"
                  disabled={busy === "email-resend"}
                  onClick={() => void onResendEmailChange()}
                  className="mt-2 rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  {busy === "email-resend" ? "Отправляем…" : "Отправить письмо снова"}
                </button>
              </div>
            ) : null}
          </div>
          <button type="submit" disabled={busy === "profile"} className="btn-primary disabled:opacity-60">{busy === "profile" ? "…" : "Сохранить профиль"}</button>
        </form>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5" /> Пароль</h2>
        <form onSubmit={onChangePassword} className="space-y-3">
          <label className="block text-sm font-semibold">
            Текущий пароль
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal" autoComplete="current-password" />
          </label>
          <label className="block text-sm font-semibold">
            Новый пароль
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal" autoComplete="new-password" />
            <span className="mt-1 block text-xs font-normal" style={{ color: "var(--muted)" }}>Не короче 8 символов.</span>
          </label>
          <label className="block text-sm font-semibold">
            Повтор нового пароля
            <input type="password" required value={password2} onChange={(e) => setPassword2(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal" autoComplete="new-password" />
          </label>
          <button type="submit" disabled={busy === "password"} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold">Сменить пароль</button>
        </form>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><MonitorSmartphone className="h-5 w-5" /> Активные устройства</h2>
        <p className="text-sm text-[var(--muted)]">
          Где сейчас выполнен вход в аккаунт. Завершение устройства сбрасывает его сессию: на нём потребуется войти заново.
        </p>
        {sessionsError ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {sessionsError}{" "}
            <button type="button" onClick={() => void loadSessions()} className="font-semibold underline">Повторить</button>
          </div>
        ) : sessions === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <RefreshCw className="h-4 w-4 animate-spin" /> Загрузка устройств…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Список устройств пуст.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => {
              const device = describeUserAgent(s.user_agent);
              return (
                <li key={s.session_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {device.label}
                      {s.is_current ? (
                        <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--primary)]">это устройство</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      Вход: {describeLastSeen(s.created_at)} · Активность: {describeLastSeen(s.last_used_at)}
                      {s.ip_hint ? ` · ${s.ip_hint}` : ""}
                    </div>
                  </div>
                  {s.is_current ? (
                    <span className="text-xs text-[var(--muted)]">Выход — кнопкой «Выйти» в меню</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onRevokeSession(s.session_id)}
                      disabled={sessionsBusy === s.session_id}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                    >
                      {sessionsBusy === s.session_id ? "Завершаем…" : "Завершить"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void onRevokeOtherSessions()}
          disabled={sessionsBusy === "others" || (sessions?.length ?? 0) < 2}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" /> {sessionsBusy === "others" ? "Завершаем…" : "Выйти на всех других устройствах"}
        </button>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" /> Способы входа</h2>
        <p className="text-sm text-[var(--muted)]">
          В аккаунте используются только почта, Google и Telegram. Почта — основной идентификатор; Google привязывается в один клик; Telegram — через подтверждение в боте.
        </p>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-4 py-3">
            <div>
              <div className="font-semibold">Почта</div>
              <div className="text-xs text-[var(--muted)]">{String(emailIdentity?.email || account?.user?.email || user?.email || "не указана")}</div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">основной вход</span>
          </div>
          {identities.filter((item) => item.provider !== "email" && item.provider !== "custom:telegram" && item.provider !== "telegram").map((id) => (
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
        {googleProvider && (
          <button
            type="button"
            disabled={linkedProviders.has("google") || !googleProvider.enabled || !!busy}
            onClick={() => void onLink("google")}
            className={clsx(
              "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm",
              linkedProviders.has("google") ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-[var(--border)] hover:bg-slate-50",
            )}
          >
            <span>
              <span className="block font-semibold">{linkedProviders.has("google") ? "✓ Google привязан" : "Привязать Google"}</span>
              <span className="block text-xs text-[var(--muted)]">{linkedProviders.has("google") ? "Вход в один клик уже доступен" : "Тот же аккаунт, без второго профиля"}</span>
            </span>
            <span className="text-lg font-black text-[#4285F4]">G</span>
          </button>
        )}
      </section>


      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" /> Telegram</h2>
        <p className="text-sm text-[var(--muted)]">Свяжите Telegram с текущим аккаунтом MEDBIOHIM. Ссылка одноразовая и действует 10 минут; пароль и токены бот не запрашивает.</p>
        {telegramStatus?.linked ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">
            <div>
              <div className="font-semibold">✓ Telegram привязан</div>
              <div className="text-xs">{telegramStatus.account?.username ? "@" + telegramStatus.account.username : telegramStatus.account?.first_name || "Аккаунт Telegram"}</div>
            </div>
            <button type="button" disabled={!!busy} onClick={() => void onUnlinkTelegram()} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">
              <Unlink className="h-3.5 w-3.5" /> Отвязать
            </button>
          </div>
        ) : (
          <button type="button" disabled={!!busy} onClick={() => void onStartTelegramLink()} className="btn-primary disabled:opacity-60">
            {busy === "telegram-link" ? "Создаём ссылку…" : "Привязать через @MEDBIOCHIM_bot"}
          </button>
        )}
        <button type="button" disabled={loading} onClick={() => void getTelegramLinkStatus().then((r) => { if (r.ok) setTelegramStatus(r.data); else setErr(describeApiError(r.error)); })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs">
          Проверить статус привязки
        </button>
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

      <section className="card space-y-5 p-5">
        <div>
          <h2 className="text-lg font-semibold">Формат отображения тестов</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Общий параметр для всех тестов и тренировок. Здесь можно сразу увидеть мини-пример каждого варианта.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {([
            ["sidebar", "Сайдбар", "Номера и статус слева"],
            ["list", "Списком", "Все задания подряд"],
            ["top", "Верхняя пагинация", "Одно задание + номера сверху"],
          ] as [TrainerLayout, string, string][]).map(([id, label, hint]) => {
            const active = trainerLayout === id;
            return (
              <button key={id} type="button" onClick={async () => {
                setTrainerLayout(id);
                const saved = await saveAccountPreferences({ trainer_layout: id });
                if (!saved.ok) {
                  setErr(describeApiError(saved.error));
                  return;
                }
                setAccount((prev) => prev ? { ...prev, preferences: { ...prev.preferences, ...saved.data.preferences } } : prev);
                setMsg("Формат тестов сохранён");
              }} className={clsx("rounded-2xl border p-3 text-left transition", active ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100" : "border-[var(--border)] hover:bg-slate-50")}>
                <div className="mb-3 rounded-xl border bg-white p-2">
                  {id === "sidebar" && (
                    <div className="grid grid-cols-[28%_1fr] gap-2">
                      <div className="space-y-1 rounded-lg bg-slate-100 p-2"><span className="block h-2 rounded bg-indigo-300" /><span className="block h-2 rounded bg-emerald-300" /><span className="block h-2 rounded bg-slate-300" /><span className="block h-2 rounded bg-slate-300" /></div>
                      <div className="space-y-2"><span className="block h-3 w-1/2 rounded bg-slate-200" /><span className="block h-14 rounded-lg bg-slate-100" /><span className="block h-3 rounded bg-slate-200" /></div>
                    </div>
                  )}
                  {id === "list" && (
                    <div className="space-y-1.5"><span className="block h-8 rounded-lg bg-slate-100" /><span className="block h-8 rounded-lg bg-slate-100" /><span className="block h-8 rounded-lg bg-slate-100" /></div>
                  )}
                  {id === "top" && (
                    <div className="space-y-2"><div className="flex gap-1"><span className="h-3 w-3 rounded-full bg-indigo-400" /><span className="h-3 w-3 rounded-full bg-slate-300" /><span className="h-3 w-3 rounded-full bg-slate-300" /><span className="h-3 w-3 rounded-full bg-slate-300" /></div><span className="block h-16 rounded-lg bg-slate-100" /></div>
                  )}
                </div>
                <div className="font-semibold">{label}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
              </button>
            );
          })}
        </div>
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

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка…</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
