"use client";

import clsx from "clsx";
import { Link2, Unlink } from "lucide-react";

import type { AccountSettings, LinkedIdentity } from "@/lib/settings-api";

export type LoginMethodsCardProps = {
  identities: LinkedIdentity[];
  emailIdentity: LinkedIdentity | undefined;
  account: AccountSettings | null;
  fallbackEmail: string;
  linkedProviders: Set<string>;
  googleProvider: { id: string; label: string; enabled: boolean } | undefined;
  busy: string | null;
  onUnlink: (identity: LinkedIdentity) => void;
  onLink: (provider: string) => void;
};

/** Способы входа: почта как основной идентификатор и привязанные сервисы. */
export function LoginMethodsCard({
  identities,
  emailIdentity,
  account,
  fallbackEmail,
  linkedProviders,
  googleProvider,
  busy,
  onUnlink,
  onLink,
}: LoginMethodsCardProps) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" /> Способы входа</h2>
      <p className="text-sm text-[var(--muted)]">
        В аккаунте используются только почта, Google и Telegram. Почта — основной идентификатор; Google привязывается в один клик; Telegram — через подтверждение в боте.
      </p>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-4 py-3">
          <div>
            <div className="font-semibold">Почта</div>
            <div className="text-xs text-[var(--muted)]">{String(emailIdentity?.email || account?.user?.email || fallbackEmail || "не указана")}</div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">основной вход</span>
        </div>
        {identities.filter((item) => item.provider !== "email" && item.provider !== "custom:telegram" && item.provider !== "telegram").map((id) => (
          <div key={id.id || id.provider} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-4 py-3">
            <div>
              <div className="font-semibold">{id.provider_label}</div>
              <div className="text-xs text-[var(--muted)]">{[id.email, id.name].filter(Boolean).join(" · ") || id.provider}</div>
            </div>
            <button type="button" disabled={!id.can_unlink} onClick={() => onUnlink(id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--status-critical-border)] px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)] disabled:opacity-40">
              <Unlink className="h-3.5 w-3.5" /> Отвязать
            </button>
          </div>
        ))}
      </div>
      {googleProvider && (
        <button
          type="button"
          disabled={linkedProviders.has("google") || !googleProvider.enabled || !!busy}
          onClick={() => onLink("google")}
          className={clsx(
            "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm",
            linkedProviders.has("google") ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-[var(--border)] hover:bg-slate-50",
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
  );
}
