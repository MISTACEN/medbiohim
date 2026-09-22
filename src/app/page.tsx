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
import { clearTokens, getDashboard, getAcademicState, hasToken, type AcademicState } from "@/lib/api";
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
  const [academic, setAcademic] = useState<AcademicState | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState<string | null>(null);

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
        const academicRes = await getAcademicState();
        if (!cancelled && academicRes.ok) setAcademic(academicRes.data);
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
  const generatePlan = async () => {
    setAcademicLoading(true);
    setAcademicError(null);
    try {
      const res = await import("@/lib/api").then((m) => m.generateAcademicAiPlan());
      if (!res.ok) throw new Error(res.error.message);
      setAcademic(res.data.source_state);
    } catch (e) {
      setAcademicError(e instanceof Error ? e.message : "Не удалось сформировать план");
    } finally { setAcademicLoading(false); }
  };

  const pendingHw = (data?.homeworks || []).filter((h) => {
    const s = String(h.my_status || h.status || "");
    return !["submitted", "graded", "done"].includes(s);
  });

  const scheduleSorted = [...(data?.schedule || [])]
    .filter((row) => !row.is_cancelled && String(row.date || ""))
    .sort((a, b) => {
      const ka = String(a.date || "") + " " + String(a.start_time || a.startTime || "");
      const kb = String(b.date || "") + " " + String(b.start_time || b.startTime || "");
      return ka.localeCompare(kb);
    });

  const { today: khToday, hm: khHm } = khNowParts();
  const todaySchedule = scheduleSorted.filter((row) => String(row.date || "") === khToday);
  const nextFutureDate = scheduleSorted.map((row) => String(row.date || "")).find((date) => date > khToday) || null;
  const futureSchedule = nextFutureDate ? scheduleSorted.filter((row) => String(row.date || "") === nextFutureDate) : [];
  const dashboardSchedule = todaySchedule.length > 0 ? todaySchedule : futureSchedule;
  const scheduleIsToday = todaySchedule.length > 0;
  const nextScheduleDate = dashboardSchedule[0] ? String(dashboardSchedule[0].date || "") : "";
  const nextAfterNow = dashboardSchedule.find((row) => {
    const startTime = String(row.start_time || row.startTime || "00:00").slice(0, 5);
    const date = String(row.date || "");
    return date > khToday || (date === khToday && startTime >= khHm);
  }) || null;
  const nearest = nextAfterNow || dashboardSchedule[0] || null;


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

      <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Академическое состояние</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Текущий прогресс и подготовка</h2>
            {academic?.session ? <p className="mt-1 text-sm text-slate-500">{String(academic.session.title || "Текущая сессия")}</p> : null}
          </div>
          <button onClick={generatePlan} disabled={academicLoading} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {academicLoading ? "Анализирую…" : "Сформировать план подготовки"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Закрыто", academic?.metrics.closed ?? 0], ["В процессе", academic?.metrics.in_progress ?? 0], ["Не начато", academic?.metrics.not_started ?? 0], ["Долги", academic?.metrics.debts ?? 0]].map(([label,value]) => (
            <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-bold text-slate-900">{String(value)}</div><div className="text-xs text-slate-500">{String(label)}</div></div>
          ))}
        </div>
        {!academic?.plan.available ? <p className="mt-4 text-sm text-amber-700">{academic?.plan.message || "Учебный план ещё не загружен."}</p> : null}
        {academic?.recommendations?.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-800">Что сейчас важно</p>
            {academic.recommendations.slice(0,3).map((r,i) => <div key={String(r.schedule_entry_id || r.topic_id || i)} className="rounded-xl border border-slate-100 p-3 text-sm"><span className="font-medium text-slate-900">{String(r.title || "Подготовка")}</span><span className="ml-2 text-slate-500">{String(r.reason || "")}</span></div>)}
          </div>
        ) : null}
        {academicError ? <p className="mt-3 text-sm text-rose-600">{academicError}</p> : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Сейчас важно</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600">
              <Calendar className="h-4 w-4" /> Ближайшее занятие
            </div>
            {dashboardSchedule.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">
                  {scheduleIsToday ? "Сегодня" : `Ближайшие · ${nextScheduleDate}`}
                </p>
                {dashboardSchedule.slice(0, 8).map((row, index) => {
                  const title = String(row.subject_name || row.subject || row.title || "Занятие");
                  const startTime = String(row.start_time || row.startTime || "—").slice(0, 5);
                  const endTime = String(row.end_time || row.endTime || "").slice(0, 5);
                  const room = String(row.room || "");
                  const teacher = String(row.teacher || "");
                  return (
                    <div key={String(row.id || index)} className={`rounded-xl border p-3 ${nextAfterNow?.id === row.id ? "border-indigo-200 bg-indigo-50/50" : "border-slate-100 bg-slate-50/50"}`}>
                      <div className="font-semibold text-slate-900">{title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{startTime}{endTime ? `–${endTime}` : ""}</span>
                        {room ? <span>ауд. {room}</span> : null}
                        {teacher ? <span>{teacher}</span> : null}
                      </div>
                    </div>
                  );
                })}
                {dashboardSchedule.length > 8 ? <p className="pt-1 text-xs text-slate-500">Ещё {dashboardSchedule.length - 8} занятия — в расписании.</p> : null}
                <Link href="/schedule" className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-indigo-600">Открыть расписание <ChevronRight className="h-4 w-4" /></Link>
              </div>
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
