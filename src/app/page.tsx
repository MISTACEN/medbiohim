"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  BookOpen,
  ClipboardList,
  Clock,
  ChevronRight,
} from "lucide-react";
import { clearTokens, getDashboard, hasToken } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";

type Dash = {
  announcements: Array<{ id: string; title: string; body: string; created_at?: string }>;
  homeworks: Array<Record<string, unknown>>;
  schedule: Array<Record<string, unknown>>;
  tests: Array<Record<string, unknown>>;
};

function khNowParts() {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vladivostok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    hm: `${parts.hour}:${parts.minute}`,
  };
}

export default function DashboardPage() {
  const { user, loading: authLoading, refresh } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasToken()) {
        setLoading(false);
        setData(null);
        return;
      }
      try {
        const res = await getDashboard();
        if (cancelled) return;
        if (res.ok) {
          setData({
            announcements: res.data.announcements || [],
            homeworks: res.data.homeworks || [],
            schedule: res.data.schedule || [],
            tests: res.data.tests || [],
          });
          setError(null);
        } else {
          const code = res.error.code || "";
          const msg = res.error.message || "Ошибка загрузки";
          if (
            /token|auth|unauthorized|bearer/i.test(code + msg) ||
            res.error.message?.includes("Bearer")
          ) {
            clearTokens();
            await refresh();
            setError(null);
            setData(null);
          } else {
            setError(msg);
            setData({ announcements: [], homeworks: [], schedule: [], tests: [] });
          }
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить данные");
          setData({ announcements: [], homeworks: [], schedule: [], tests: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const name = user?.name?.split(" ")[0] || "студент";
  const pendingHw = (data?.homeworks || []).filter((h) => {
    const s = String(h.my_status || h.status || "");
    return !["submitted", "graded", "done"].includes(s);
  });

  const nearest = (() => {
    const list = data?.schedule || [];
    if (!list.length) return null;
    const { today, hm } = khNowParts();
    const upcoming = list
      .filter((row) => {
        if (row.is_cancelled) return false;
        const date = String(row.date || "");
        const start = String(row.start_time || row.startTime || "00:00").slice(0, 5);
        if (!date) return false;
        if (date < today) return false;
        if (date === today && start < hm) return false;
        return true;
      })
      .sort((a, b) => {
        const da = String(a.date || "");
        const db = String(b.date || "");
        if (da !== db) return da.localeCompare(db);
        return String(a.start_time || a.startTime || "").localeCompare(
          String(b.start_time || b.startTime || "")
        );
      });
    return upcoming[0] || null;
  })();

  const nearestTitle = nearest
    ? String(nearest.subject_name || nearest.subject || nearest.title || "Занятие")
    : "";
  const nearestStart = nearest
    ? String(nearest.start_time || nearest.startTime || "—").slice(0, 5)
    : "";
  const nearestEnd = nearest
    ? String(nearest.end_time || nearest.endTime || "").slice(0, 5)
    : "";
  const nearestDate = nearest ? String(nearest.date || "") : "";
  const nearestGroup = nearest
    ? String(nearest.group_name || nearest.group_code || "")
    : "";
  const { today: khToday } = khNowParts();

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <SkeletonCards count={3} />
      </div>
    );
  }

  if (!hasToken() || !user) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Медбиохим</h1>
        <p className="mt-2 text-sm text-slate-500">
          Войдите, чтобы видеть расписание, задания и прогресс
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            Регистрация
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm sm:p-8">
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Сегодня</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Привет, {name} 👋
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Расписание, задания и прогресс — в одном месте.
          </p>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/schedule"
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Расписание
            </Link>
            <Link
              href="/homework"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Задания
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Сейчас важно</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600">
              <Calendar className="h-4 w-4" /> Ближайшее занятие
            </div>
            {nearest ? (
              <>
                <div className="text-lg font-semibold text-slate-900">{nearestTitle}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {nearestDate && nearestDate !== khToday ? `${nearestDate} · ` : ""}
                    {nearestStart}
                    {nearestEnd ? `–${nearestEnd}` : ""}
                  </span>
                </div>
                {nearestGroup ? (
                  <p className="mt-1 text-xs text-slate-500">{nearestGroup}</p>
                ) : null}
              </>
            ) : (
              <p className="text-slate-500">Нет ближайших занятий</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600">
              <ClipboardList className="h-4 w-4" /> Домашние задания
            </div>
            <div className="text-3xl font-bold text-indigo-600">{pendingHw.length}</div>
            <p className="text-sm text-slate-500">активных</p>
            <Link
              href="/homework"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600"
            >
              Все задания <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600">
              <BookOpen className="h-4 w-4" /> Тесты
            </div>
            <div className="text-3xl font-bold text-indigo-600">{(data?.tests || []).length}</div>
            <p className="text-sm text-slate-500">доступно</p>
            <Link
              href="/tests"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600"
            >
              К тестам <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-800">Задания</h3>
          {(data?.homeworks || []).length === 0 ? (
            <p className="text-sm text-slate-500">Пока нет заданий</p>
          ) : (
            <ul className="space-y-3">
              {(data?.homeworks || []).slice(0, 6).map((hw, i) => (
                <li
                  key={String(hw.id || i)}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                >
                  <div className="font-medium text-slate-900">{String(hw.title || "Задание")}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {hw.due_at ? `до ${String(hw.due_at).slice(0, 10)}` : ""}
                    {hw.my_status || hw.status
                      ? ` · ${String(hw.my_status || hw.status)}`
                      : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-800">Объявления</h3>
          {(data?.announcements || []).length === 0 ? (
            <p className="text-sm text-slate-500">Нет объявлений</p>
          ) : (
            <ul className="space-y-3">
              {(data?.announcements || []).map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                >
                  <div className="font-medium text-slate-900">{a.title}</div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
