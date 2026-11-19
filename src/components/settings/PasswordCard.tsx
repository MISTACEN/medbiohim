"use client";

import { KeyRound } from "lucide-react";
import type { FormEvent } from "react";

export type PasswordCardProps = {
  currentPassword: string;
  password: string;
  password2: string;
  busy: string | null;
  onCurrentPassword: (value: string) => void;
  onPassword: (value: string) => void;
  onPassword2: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

/** Смена пароля с проверкой длины и совпадения повтора. */
export function PasswordCard({
  currentPassword,
  password,
  password2,
  busy,
  onCurrentPassword,
  onPassword,
  onPassword2,
  onSubmit,
}: PasswordCardProps) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5" /> Пароль</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm font-semibold">
          Текущий пароль
          <input type="password" required value={currentPassword} onChange={(e) => onCurrentPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal" autoComplete="current-password" />
        </label>
        <label className="block text-sm font-semibold">
          Новый пароль
          <input type="password" required value={password} onChange={(e) => onPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal" autoComplete="new-password" />
          <span className="mt-1 block text-xs font-normal" style={{ color: "var(--muted)" }}>Не короче 8 символов.</span>
        </label>
        <label className="block text-sm font-semibold">
          Повтор нового пароля
          <input type="password" required value={password2} onChange={(e) => onPassword2(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal" autoComplete="new-password" />
        </label>
        <button type="submit" disabled={busy === "password"} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold">Сменить пароль</button>
      </form>
    </section>
  );
}
