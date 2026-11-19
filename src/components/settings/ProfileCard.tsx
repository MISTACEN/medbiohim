"use client";

import clsx from "clsx";
import { Mail } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";

import type { AccountSettings } from "@/lib/settings-api";

export type ProfileCardProps = {
  account: AccountSettings | null;
  avatarPreview: string | null;
  avatarUploadEnabled: boolean;
  avatarBusy: boolean;
  fullName: string;
  email: string;
  emailPending: string;
  busy: string | null;
  fallbackName: string;
  fallbackEmail: string;
  onFullName: (value: string) => void;
  onEmail: (value: string) => void;
  onAvatarPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
  onSaveProfile: (event: FormEvent) => void;
  onResendEmailChange: () => void;
};

/** Профиль: аватар, имя, почта и ожидание подтверждения смены адреса. */
export function ProfileCard({
  account,
  avatarPreview,
  avatarUploadEnabled,
  avatarBusy,
  fullName,
  email,
  emailPending,
  busy,
  fallbackName,
  fallbackEmail,
  onFullName,
  onEmail,
  onAvatarPick,
  onAvatarRemove,
  onSaveProfile,
  onResendEmailChange,
}: ProfileCardProps) {
  return (
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
            : String(String(fullName || fallbackName || "?").trim().charAt(0) || "?").toUpperCase()}
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
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onAvatarPick(e)} disabled={avatarBusy} />
              </label>
            ) : null}
            {account?.user?.has_uploaded_avatar && avatarUploadEnabled ? (
              <button
                type="button"
                onClick={onAvatarRemove}
                disabled={avatarBusy}
                className="rounded-lg border border-[var(--status-critical-border)] px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)] disabled:opacity-60"
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
          <input value={fullName} onChange={(e) => onFullName(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
        <div className="block text-sm">
          <label htmlFor="settings-email" className="mb-1 block text-xs text-[var(--muted)]">Email</label>
          <input id="settings-email" type="email" value={email} onChange={(e) => onEmail(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
          {emailPending ? (
            <div className="mt-2 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-xs text-[var(--status-warn-fg)]">
              <div className="font-semibold">Адрес {emailPending} ждёт подтверждения</div>
              <p className="mt-1 leading-relaxed">
                Пока вы не перейдёте по ссылке из письма, вход остаётся на{" "}
                {String(account?.user?.email || fallbackEmail || "текущий адрес")}. Если письма нет — проверьте «Спам».
              </p>
              <button
                type="button"
                disabled={busy === "email-resend"}
                onClick={onResendEmailChange}
                className="mt-2 rounded-lg border border-[var(--status-warn-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                {busy === "email-resend" ? "Отправляем…" : "Отправить письмо снова"}
              </button>
            </div>
          ) : null}
        </div>
        <button type="submit" disabled={busy === "profile"} className="btn-primary disabled:opacity-60">{busy === "profile" ? "…" : "Сохранить профиль"}</button>
      </form>
    </section>
  );
}
