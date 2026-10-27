"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ADMIN_SECTIONS } from "@/components/admin/AdminNav";
import { adminListUsers, adminOverview, hasToken } from "@/lib/api";

const COUNT_LABELS: Record<string, string> = {
  groups: "Группы",
  subjects: "Предметы",
  announcements: "Объявления",
  schedule: "Занятия",
  tests_local: "Тесты",
  curriculum: "Учебный план",
};

/** Дашборд админки: сводка + все разделы из единого списка ADMIN_SECTIONS. */
export default function AdminPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!hasToken()) return;
    setLoading(true);
    setError("");
    const [overview, people] = await Promise.all([adminOverview(), adminListUsers()]);
    if (overview.ok) setCounts(overview.data.counts || {});
    else setError(overview.error.message);
    // `items` ограничен 100 строками — для счётчика берём точное значение из БД.
    if (people.ok) setUsers(Number(people.data.total ?? (people.data.items || []).length));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">CMS Медбиохим</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const tiles = ADMIN_SECTIONS.filter((section) => section.title !== "Обзор");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">CMS Медбиохим</h1>
          <p className="page-subtitle">
            Управление сайтом и учебным контентом{user?.name || user?.email ? ` · ${user?.name || user?.email}` : ""}
          </p>
        </div>
        <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </header>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Object.entries(counts).map(([key, value]) => (
          <div className="card" key={key}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{COUNT_LABELS[key] || key}</div>
            <div className="mt-1 text-2xl font-bold text-indigo-600">{value}</div>
          </div>
        ))}
        {users !== null && (
          <div className="card">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Пользователи</div>
            <div className="mt-1 text-2xl font-bold text-indigo-600">{users}</div>
          </div>
        )}
        {Object.keys(counts).length === 0 && users === null && !error && (
          <div className="card text-sm text-slate-500">Загружаем сводку…</div>
        )}
      </div>

      {tiles.map((section) => (
        <section key={section.title}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{section.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.items.map(({ href, label, icon: Icon, desc }) => (
              <Link
                key={href}
                href={href}
                className="card group flex items-start gap-3 transition hover:border-indigo-300 hover:shadow-sm"
              >
                <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-semibold">
                    {label}
                    <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">{desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
