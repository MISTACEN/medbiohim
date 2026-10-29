"use client";

import Link from "next/link";
import { Database, ShieldCheck } from "lucide-react";
import { hasToken } from "@/lib/api";
import AdminDatabaseConsole from "@/components/admin/AdminDatabaseConsole";

export default function AdminDatabasePage() {
  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <Database className="mx-auto h-10 w-10 text-indigo-600" />
        <h1 className="mt-3 page-title">База данных</h1>
        <p className="page-subtitle">
          Войдите под учётной записью администратора, чтобы подключать и управлять базами.
        </p>
        <Link href="/login" className="btn-primary mt-5 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1800px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-indigo-600 hover:underline">← Админ-панель</Link>
          <h1 className="mt-1 page-title">SQL базы данных</h1>
          <p className="page-subtitle">
            Подключение, настройка, схема, редактирование строк и SQL прямо из админ-панели.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-xs font-semibold text-[var(--status-ok-fg)]">
          <ShieldCheck className="h-4 w-4" />
          Доступ только администратору
        </div>
      </header>
      <AdminDatabaseConsole />
    </main>
  );
}
