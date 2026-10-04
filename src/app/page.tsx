"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  ArrowRight,
  Sparkles,
  Bot,
  Calculator,
  Users,
  CheckCircle2,
  AlertTriangle,
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

  const closed = Number(academic?.metrics?.closed ?? 0);
  const inProgress = Number(academic?.metrics?.in_progress ?? 0);
  const notStarted = Number(academic?.metrics?.not_started ?? 0);
  const debts = Number(academic?.metrics?.debts ?? 0);
  const academicTotal = closed + inProgress + notStarted + debts;
  const academicProgress = academicTotal ? Math.round((closed / academicTotal) * 100) : 0;
  const activeTasks = pendingHw.length + (data?.tests || []).length;
  const quickCards = [
    { href: "/subjects", label: "Предметы", text: "Все дисциплины, план, лекции, материалы и практика.", icon: BookOpen, tone: "blue", action: "Открыть" },
    { href: "/tutor", label: "AI-тьютор", text: "Разбор сложной темы, вопроса или подготовка к занятию.", icon: Bot, tone: "green", action: "Запустить" },
    { href: "/calculators", label: "Калькуляторы", text: "Расчёты для биохимии и клинических задач.", icon: Calculator, tone: "cyan", action: "Использовать" },
    { href: "/community", label: "Сообщество", text: "Обсуждения группы, материалы и учебные вопросы.", icon: Users, tone: "violet", action: "Открыть" },
  ];


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
    <div className="space-y-7 pb-6">
      <section className="hero-banner aero-hero relative overflow-hidden text-white">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/18 px-3.5 py-1.5 text-xs font-bold shadow-sm backdrop-blur-xl"><Sparkles className="h-3.5 w-3.5" /> Платформа клинической биохимии</div>
            <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Добро пожаловать в Медбиохим, {name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/90 sm:text-base">Расписание, предметы, задания и подготовка к занятиям — в одном месте. Продолжайте с того места, где остановились.</p>
            {error && <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/15 px-3 py-2 text-xs text-white backdrop-blur-xl"><AlertTriangle className="h-4 w-4" /> {error}</div>}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/subjects" className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/95 px-5 py-2.5 text-sm font-bold text-[#087fe8] shadow-lg transition hover:-translate-y-0.5"><BookOpen className="h-4 w-4" /> Продолжить обучение</Link>
              <Link href="/tutor" className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/16 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/24"><Bot className="h-4 w-4" /> Спросить AI-тьютора</Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/70 p-5 text-slate-900 shadow-xl backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Текущий прогресс</div><span className="aero-chip rounded-full px-3 py-1 text-[11px] font-bold text-emerald-700">Семестр {user?.semester ?? "—"}</span></div>
            <div className="mt-4 flex items-end justify-between"><div><div className="text-4xl font-extrabold tracking-tight text-[#087fe8]">{academicProgress}%</div><div className="mt-1 text-xs text-slate-500">закрыто учебных задач</div></div><div className="text-right text-xs text-slate-500"><div><b className="text-slate-900">{closed}</b> закрыто</div><div><b className="text-slate-900">{inProgress}</b> в процессе</div></div></div>
            <div className="aero-progress-track mt-4 h-3 overflow-hidden rounded-full"><div className="aero-progress-fill h-full rounded-full transition-all duration-700" style={{ width: academicProgress + "%" }} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2.5"><div className="rounded-2xl border border-white bg-white/75 p-3"><div className="text-2xl font-bold text-emerald-600">{activeTasks}</div><div className="text-[11px] text-slate-500">активных задач</div></div><div className="rounded-2xl border border-white bg-white/75 p-3"><div className="text-2xl font-bold text-rose-500">{debts}</div><div className="text-[11px] text-slate-500">долгов</div></div></div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><h2 className="aero-section-title text-lg font-bold text-slate-900">Быстрый доступ</h2><Link href="/subjects" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Все разделы <ArrowRight className="h-4 w-4" /></Link></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickCards.map((item) => {
            const Icon = item.icon;
            const tone = item.tone === "green" ? "from-emerald-400 to-emerald-600" : item.tone === "cyan" ? "from-cyan-400 to-sky-600" : item.tone === "violet" ? "from-violet-400 to-indigo-600" : "from-sky-400 to-blue-600";
            return <Link key={item.href} href={item.href} className="aero-quick-card group rounded-3xl p-5"><div className={`aero-gloss relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white`}><Icon className="h-6 w-6" /></div><h3 className="mt-4 text-base font-bold text-slate-900">{item.label}</h3><p className="mt-1.5 min-h-[2.8rem] text-xs leading-5 text-slate-600">{item.text}</p><div className="mt-4 flex items-center justify-between border-t border-white/70 pt-3 text-xs font-bold text-primary"><span>{item.action}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></div></Link>;
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.95fr)]">
        <section className="aero-quick-card rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="aero-section-title text-lg font-bold text-slate-900">{scheduleIsToday ? "Расписание на сегодня" : "Ближайшее расписание"}</h2><p className="mt-1 text-xs text-slate-500">{scheduleIsToday ? "Хабаровск · сегодня" : nextScheduleDate || "Нет ближайших занятий"}</p></div><Link href="/schedule" className="aero-chip inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-primary">Все расписание <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          {dashboardSchedule.length ? <div className="space-y-2.5">{dashboardSchedule.slice(0, 5).map((row, index) => {
            const type = String(row.type || "other").toLowerCase();
            const tint = type.includes("labor") ? "from-amber-400 to-orange-500" : type.includes("practice") ? "from-emerald-400 to-teal-600" : type.includes("seminar") ? "from-cyan-400 to-sky-600" : type.includes("lecture") ? "from-blue-400 to-blue-700" : "from-violet-400 to-indigo-600";
            const title = String(row.subject_name || row.subject || row.title || "Занятие");
            const startTime = String(row.start_time || row.startTime || "—").slice(0, 5);
            const endTime = String(row.end_time || row.endTime || "").slice(0, 5);
            const room = String(row.room || "");
            const teacher = String(row.teacher || "");
            const isNext = nextAfterNow?.id === row.id;
            return <div key={String(row.id || index)} className={`group rounded-2xl border p-3.5 ${isNext ? "border-sky-200 bg-white/84 shadow-md" : "border-white/75 bg-white/50"}`}><div className="flex items-center gap-3"><div className={`aero-gloss flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-b ${tint} text-white`}><span className="text-[11px] font-bold leading-none">{startTime}</span><span className="mt-1 text-[10px] opacity-85">{endTime}</span></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900">{title}</span>{isNext && <span className="badge-primary">Следующее</span>}</div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">{room && <span>ауд. {room}</span>}{teacher && <span>{teacher}</span>}<span>{String(row.group_name || row.group_code || "")}</span></div></div><ArrowRight className="hidden h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 sm:block" /></div></div>;
          })}{dashboardSchedule.length > 5 && <div className="pt-1 text-xs text-slate-500">Ещё {dashboardSchedule.length - 5} занятий — в расписании.</div>}</div> : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">Ближайших занятий нет.</div>}
        </section>
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3"><div><h2 className="aero-section-title text-lg font-bold text-slate-900">Текущие задачи</h2><p className="mt-1 text-xs text-slate-500">{activeTasks} активных элементов</p></div><Link href="/homework" className="text-sm font-semibold text-primary hover:underline">Все</Link></div>
          {pendingHw.slice(0, 3).map((hw, i) => <div key={String(hw.id || i)} className="aero-quick-card rounded-3xl p-4"><div className="flex items-start gap-3"><div className="aero-gloss flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 text-white"><ClipboardList className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-[11px] font-bold uppercase tracking-wide text-rose-500">Задание</div><div className="mt-1 font-bold text-slate-900">{String(hw.title || "Задание")}</div><div className="mt-1 text-xs text-slate-500">{hw.due_at ? `Срок: ${String(hw.due_at).slice(0,10)}` : "Срок не указан"}</div></div></div><Link href="/homework" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">Открыть <ArrowRight className="h-3.5 w-3.5" /></Link></div>)}
          {!pendingHw.length && <div className="aero-quick-card rounded-3xl p-5"><div className="flex items-center gap-3"><div className="aero-gloss flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"><CheckCircle2 className="h-5 w-5" /></div><div><div className="font-bold text-slate-900">По заданиям всё чисто</div><div className="text-xs text-slate-500">Новых долгов нет.</div></div></div></div>}
          {academic?.recommendations?.slice(0, 2).map((r, i) => <div key={String(r.schedule_entry_id || r.topic_id || i)} className="aero-quick-card rounded-3xl p-4"><div className="flex items-start gap-3"><div className="aero-gloss flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 text-white"><Sparkles className="h-5 w-5" /></div><div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-primary">Рекомендация</div><div className="mt-1 font-semibold text-slate-900">{String(r.title || "Подготовка")}</div><p className="mt-1 text-xs leading-5 text-slate-500">{String(r.reason || "")}</p></div></div></div>)}
        </section>
      </div>

      <section className="aero-quick-card rounded-3xl p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="badge-primary inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Академическая рекомендация</div><h2 className="mt-2 text-xl font-extrabold text-slate-900">Соберите персональный план подготовки</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">AI может учитывать ближайшие занятия, долги и текущее состояние учебного плана, чтобы показать, что стоит закрыть первым.</p></div><button onClick={generatePlan} disabled={academicLoading} className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5">{academicLoading ? "Анализирую…" : "Сформировать план"} <ArrowRight className="h-4 w-4" /></button></div>
        {academicError && <p className="mt-3 text-sm text-rose-600">{academicError}</p>}
      </section>
    </div>
  );
}
