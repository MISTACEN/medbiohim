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
import { getDashboard, hasToken } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";

type Dash = {
  announcements: Array<{ id: string; title: string; body: string; created_at?: string }>;
  homeworks: Array<Record<string, unknown>>;
  schedule: Array<Record<string, unknown>>;
  tests: Array<Record<string, unknown>>;
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasToken()) {
        setLoading(false);
        setData({ announcements: [], homeworks: [], schedule: [], tests: [] });
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
          setError(res.error.message);
          setData({ announcements: [], homeworks: [], schedule: [], tests: [] });
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
  }, []);

  const name = user?.name?.split(" ")[0] || "студент";
  const pendingHw = (data?.homeworks || []).filter((h) => {
    const s = String(h.my_status || h.status || "");
    return !["submitted", "graded", "done"].includes(s);
  });
  const nearest = (data?.schedule || [])[0];

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <SkeletonCards count={3} />
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-lg p-10 text-center">
        <h1 className="page-title">Медбиохим</h1>
        <p className="page-subtitle mt-2">Войдите, чтобы видеть расписание, задания и прогресс</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login" className="btn-primary">
            Войти
          </Link>
          <Link href="/register" className="btn-secondary">
            Регистрация
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="hero-banner">
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Сегодня</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Привет, {name} 👋
          </h1>
          <p className="mt-2 text-body text-slate-600">
            Данные с сервера: задания, объявления и расписание вашей группы.
          </p>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/schedule" className="btn-primary">
              Расписание
            </Link>
            <Link href="/homework" className="btn-secondary">
              Задания
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Сейчас важно</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <Calendar className="h-4 w-4" /> Ближайшее занятие
            </div>
            {nearest ? (
              <>
                <div className="text-lg font-semibold">
                  {String(nearest.subject || nearest.title || "Занятие")}
                </div>
                <div className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                  <Clock className="h-3.5 w-3.5" />
                  {String(nearest.start_time || nearest.startTime || "—")}
                  {nearest.end_time || nearest.endTime
                    ? `–${String(nearest.end_time || nearest.endTime)}`
                    : ""}
                </div>
              </>
            ) : (
              <p className="text-slate-500">Нет записей в расписании</p>
            )}
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <ClipboardList className="h-4 w-4" /> Домашние задания
            </div>
            <div className="text-3xl font-bold text-primary">{pendingHw.length}</div>
            <p className="text-sm text-slate-500">активных</p>
            <Link href="/homework" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Все задания <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <BookOpen className="h-4 w-4" /> Тесты
            </div>
            <div className="text-3xl font-bold text-primary">{(data?.tests || []).length}</div>
            <p className="text-sm text-slate-500">доступно</p>
            <Link href="/tests" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              К тестам <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h3 className="mb-4 font-semibold">Задания</h3>
          {(data?.homeworks || []).length === 0 ? (
            <p className="text-sm text-slate-500">Пока нет заданий</p>
          ) : (
            <ul className="space-y-3">
              {(data?.homeworks || []).slice(0, 6).map((hw, i) => (
                <li key={String(hw.id || i)} className="rounded-soft border border-slate-100 bg-slate-50/80 p-3">
                  <div className="font-medium">{String(hw.title || "Задание")}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {hw.due_at ? `до ${String(hw.due_at).slice(0, 10)}` : ""}
                    {hw.my_status || hw.status ? ` · ${String(hw.my_status || hw.status)}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3 className="mb-4 font-semibold">Объявления</h3>
          {(data?.announcements || []).length === 0 ? (
            <p className="text-sm text-slate-500">Нет объявлений</p>
          ) : (
            <ul className="space-y-3">
              {(data?.announcements || []).map((a) => (
                <li key={a.id} className="rounded-soft border border-slate-100 bg-slate-50/80 p-3">
                  <div className="font-medium">{a.title}</div>
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
