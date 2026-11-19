"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { THEMES, useTheme, type AppThemeId } from "@/components/theme/ThemeProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useApiRequest } from "@/hooks/useApiRequest";
import { describeApiError } from "@/lib/errors";
import { deleteAvatar, forgetAvatar, getAvatarUrl, uploadAvatar } from "@/lib/api";
import {
  changeAccountPassword,
  getAccountSettings,
  getTelegramLinkStatus,
  listActiveSessions,
  resendEmailChange,
  revokeActiveSession,
  revokeOtherSessions,
  saveAccountPreferences,
  startLinkIdentity,
  startTelegramLink,
  unlinkIdentity,
  unlinkTelegramAccount,
  updateAccountProfile,
  type AccountSettings,
  type ActiveSession,
  type LinkedIdentity,
  type TelegramLinkStatus,
} from "@/lib/settings-api";

export type TrainerLayout = "sidebar" | "list" | "top";

const ALLOWED_PROVIDERS = new Set(["email", "google", "custom:telegram", "telegram"]);

/**
 * Состояние и действия страницы настроек аккаунта.
 *
 * Вся загрузка данных, работа с аватаром, паролем, привязками и устройствами
 * живёт здесь; страница только собирает карточки разделов.
 */
export function useSettingsData() {
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { user, refresh } = useAuth();
  const { confirm, dialog } = useConfirm();
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
  // Провайдер для «Объяснить · ИИ» в тестах (хранится в preferences).
  const [aiExplainProvider, setAiExplainProvider] = useState("auto");
  const [telegramStatus, setTelegramStatus] = useState<TelegramLinkStatus | null>(null);
  // Отдельно от «не привязан»: недоступный статус нельзя выдавать за отсутствие привязки.
  const [telegramStatusError, setTelegramStatusError] = useState<string | null>(null);
  // Ожидание подтверждения в боте: пока ждём, статус опрашивается сам.
  const [telegramWait, setTelegramWait] = useState<{ url: string; expiresAt: number } | null>(null);
  const [clock, setClock] = useState(0);
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
      const savedAi = String(r.data.preferences?.ai_explain_provider || "auto");
      if (["auto", "gigachat", "groq", "mistral", "openai", "openrouter", "custom"].includes(savedAi)) setAiExplainProvider(savedAi);
    } else {
      setErr(describeApiError(r.error));
      setFullName(user?.name || "");
      setEmail(user?.email || "");
    }
    const tg = await getTelegramLinkStatus();
    if (tg.ok) {
      setTelegramStatus(tg.data);
      setTelegramStatusError(null);
    } else {
      setTelegramStatusError(describeApiError(tg.error));
    }
    setLoading(false);
    return r;
  }, [user?.name, user?.email]);

  useEffect(() => { void load(); }, [load]);

  // Превью аватара: приоритет у загруженного файла (приватный прокси), иначе
  // внешний https-адрес из профиля (например, Google). Ошибку сети не показываем
  // баннером — просто остаются инициалы.
  const { data: avatarPreview } = useApiRequest<string | null>(async () => {
    const userId = String(account?.user?.id || user?.id || "");
    const external = String(account?.user?.avatar_url || "");
    const uploaded = Boolean(account?.user?.has_uploaded_avatar);
    if (!uploaded) return /^https:\/\//i.test(external) ? external : null;
    if (!userId) return null;
    return getAvatarUrl(userId);
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
  const oauthError = searchParams.get("error_description") || searchParams.get("error") || "";

  useEffect(() => {
    if (recoveryFromQuery) setRecoveryMode(true);
    if (!linkedFromQuery && !oauthError) return;
    window.history.replaceState({}, "", "/settings");
    // Возврат с OAuth сам по себе не доказывает, что привязка удалась:
    // пользователь мог отменить вход. Проверяем, что Google реально в identities,
    // а причину отказа показываем текстом, а не «попробуйте ещё раз».
    setMsg(linkedFromQuery ? "Проверяем привязку Google…" : null);
    void load().then((r) => {
      const linked = r.ok && (r.data.identities || []).some((item) => item.provider === "google");
      if (linked) {
        setMsg("Google привязан. Данные остаются на том же аккаунте.");
        return;
      }
      setMsg(null);
      setErr(oauthError
        ? `Привязка Google не завершена: ${oauthError}`
        : "Google не привязан: привязка не завершена. Попробуйте ещё раз.");
    });
  }, [recoveryFromQuery, linkedFromQuery, oauthError, load]);

  // Автоподтверждение Telegram: пока ждём, проверяем статус раз в 3 секунды.
  // Таймер честно истекает: просроченная ссылка не «висит» вечно.
  useEffect(() => {
    if (!telegramWait || telegramStatus?.linked) return;
    // Это остановка интервала опроса, а не ручной cancelled-флаг загрузки данных
    // (D9 требует useApiRequest для запросов страницы).
    let stopped = false;
    const tick = async () => {
      const current = Date.now();
      setClock(current);
      if (current >= telegramWait.expiresAt) {
        setTelegramWait(null);
        setErr("Ссылка на привязку истекла. Создайте новую — старая больше не работает.");
        return;
      }
      const status = await getTelegramLinkStatus();
      if (stopped) return;
      if (status.ok) {
        setTelegramStatusError(null);
        if (status.data.linked) {
          setTelegramStatus(status.data);
          setTelegramWait(null);
          setMsg("Telegram привязан. Теперь бот узнаёт ваш аккаунт.");
        }
      }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [telegramWait, telegramStatus?.linked]);

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
    const r = await startLinkIdentity(provider, `${origin}/auth/callback?linked=google`);
    setBusy(null);
    if (!r.ok) {
      // Гонка: привязку могли завершить в другой вкладке. Тогда это не ошибка.
      if (r.error.code === "IDENTITY_ALREADY_LINKED") {
        await load();
        setMsg("Google уже привязан к этому аккаунту");
        return;
      }
      return setErr(describeApiError(r.error));
    }
    if (r.data.url) window.location.href = r.data.url;
    else setErr("Нет URL для привязки");
  }

  async function onStartTelegramLink() {
    setBusy("telegram-link"); setErr(null); setMsg(null);
    const r = await startTelegramLink();
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    const expiresAt = Date.now() + Math.max(60, r.data.expires_in_seconds || 600) * 1000;
    setTelegramWait({ url: r.data.url, expiresAt });
    setClock(Date.now());
    // Не открываем t.me сами: после await браузер блокирует popup, а запасной
    // переход увёл бы со страницы и сломал автоподтверждение. Ссылка — кнопкой
    // в карточке ожидания, это действие пользователя и открывается всегда.
    setMsg("Ссылка готова. Откройте бота кнопкой ниже — статус обновится сам.");
  }

  async function onUnlinkTelegram() {
    if (!(await confirm({
      title: "Отвязать Telegram от этого аккаунта MEDBIOHIM?",
      confirmLabel: "Отвязать",
      danger: true,
    }))) return;
    setBusy("telegram-unlink"); setErr(null);
    const r = await unlinkTelegramAccount();
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    setTelegramWait(null);
    const status = await getTelegramLinkStatus();
    if (status.ok) { setTelegramStatus(status.data); setTelegramStatusError(null); }
    setMsg("Telegram отвязан");
  }

  async function onUnlink(id: LinkedIdentity) {
    if (!id.can_unlink) return setErr("Нельзя отвязать единственный способ входа");
    if (!(await confirm({
      title: `Отвязать ${id.provider_label}?`,
      confirmLabel: "Отвязать",
      danger: true,
    }))) return;
    setBusy("unlink-" + id.id);
    const r = await unlinkIdentity(id.id);
    setBusy(null);
    if (!r.ok) return setErr(describeApiError(r.error));
    setAccount(r.data);
    setMsg(`${id.provider_label} отвязан`);
  }

  function onCancelTelegramWait() {
    setTelegramWait(null);
    setMsg("Ожидание привязки отменено. Ссылка больше не используется.");
  }

  function checkTelegramStatus() {
    return getTelegramLinkStatus().then((r) => {
      if (r.ok) {
        setTelegramStatus(r.data);
        setTelegramStatusError(null);
        setMsg(r.data.linked ? "Telegram привязан" : "Telegram пока не привязан");
      } else {
        setErr(describeApiError(r.error));
      }
    });
  }

  async function saveTrainerLayout(id: TrainerLayout) {
    setTrainerLayout(id);
    const saved = await saveAccountPreferences({ trainer_layout: id });
    if (!saved.ok) {
      setErr(describeApiError(saved.error));
      return;
    }
    setAccount((prev) => prev ? { ...prev, preferences: { ...prev.preferences, ...saved.data.preferences } } : prev);
    setMsg("Формат тестов сохранён");
  }

  async function saveAiExplainProvider(id: string) {
    const previous = aiExplainProvider;
    setAiExplainProvider(id);
    const saved = await saveAccountPreferences({ ai_explain_provider: id });
    if (!saved.ok) {
      setAiExplainProvider(previous);
      setErr(describeApiError(saved.error));
      return;
    }
    setAccount((prev) => prev ? { ...prev, preferences: { ...prev.preferences, ...saved.data.preferences } } : prev);
    setMsg("Настройка ИИ-пояснений сохранена");
  }

  function selectTheme(id: AppThemeId) {
    setTheme(id);
    void saveAccountPreferences({ theme: id });
  }

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

  return {
    account, loading, msg, err, busy,
    fullName, setFullName,
    email, setEmail,
    emailPending,
    currentPassword, setCurrentPassword,
    password, setPassword,
    password2, setPassword2,
    recoveryMode,
    trainerLayout, saveTrainerLayout,
    aiExplainProvider, saveAiExplainProvider,
    theme, selectTheme,
    themes: THEMES, referenceThemes, otherThemes,
    fallbackName: user?.name || "",
    fallbackEmail: user?.email || "",
    telegramStatus, telegramStatusError, telegramWait, setTelegramWait, clock,
    sessions, sessionsError, sessionsBusy, loadSessions, onRevokeSession, onRevokeOtherSessions,
    avatarPreview, avatarUploadEnabled, avatarBusy, onAvatarPick, onAvatarRemove,
    identities, linkedProviders, googleProvider, emailIdentity,
    load, onSaveProfile, onResendEmailChange, onChangePassword,
    onLink, onUnlink, onStartTelegramLink, onUnlinkTelegram, checkTelegramStatus, onCancelTelegramWait,
    dialog,
  };
}
