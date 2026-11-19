"use client";

import { Check, Mail, Send, Shield } from "lucide-react";

import clsx from "clsx";

import type { AccountSettings, LinkedIdentity, TelegramLinkStatus } from "@/lib/settings-api";

export type AccountOverviewProps = {
  account: AccountSettings | null;
  emailIdentity: LinkedIdentity | undefined;
  linkedProviders: Set<string>;
  telegramStatus: TelegramLinkStatus | null;
  fallbackEmail: string;
};

/** Карточка «Единый аккаунт»: почта, Google и Telegram в одной сводке. */
export function AccountOverview({
  account,
  emailIdentity,
  linkedProviders,
  telegramStatus,
  fallbackEmail,
}: AccountOverviewProps) {
  return (
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
            active: Boolean(emailIdentity || account?.user?.email || fallbackEmail),
            detail: String(emailIdentity?.email || account?.user?.email || fallbackEmail || "не указана"),
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
          <div key={item.key} className={clsx("rounded-xl border px-3 py-2.5", item.active ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]" : "border-[var(--border)]")}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {item.icon}
              {item.title}
              {item.active && <Check className="ml-auto h-3.5 w-3.5 text-[var(--status-ok-fg)]" />}
            </div>
            <div className="mt-1 truncate text-xs text-[var(--muted)]">{item.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
