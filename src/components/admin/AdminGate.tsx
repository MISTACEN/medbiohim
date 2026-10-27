"use client";

import Link from "next/link";
import { ShieldAlert, LogIn } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isStaff } from "@/lib/admin/access";

/**
 * Единственное место, где клиент проверяет доступ к `/admin`.
 *
 * Раньше каждая страница проверяла только наличие токена, поэтому студент видел
 * всю CMS-навигацию, плитки и получал 403 по каждому запросу. Административные
 * права по-прежнему проверяет воркер на каждом маршруте — здесь только UX.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Проверяем права доступа</span>
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
        >
          <LogIn className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold" style={{ color: "var(--text)" }}>
          Сначала войдите
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Панель управления доступна только сотрудникам: администраторам, модераторам и
          преподавателям.
        </p>
        <Link href="/login" className="btn-primary mt-5 inline-flex">
          Войти
        </Link>
      </div>
    );
  }

  if (!isStaff(user.roles)) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
        >
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold" style={{ color: "var(--text)" }}>
          Доступ только для персонала
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Ваш аккаунт — студенческий. Если вам нужны права преподавателя или администратора,
          попросите администратора выдать роль в разделе «Пользователи и роли».
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary inline-flex">
            На главную
          </Link>
          <Link href="/settings" className="btn-secondary inline-flex">
            Настройки профиля
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
