"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  BookOpen,
  ClipboardList,
  Clock,
  ChevronRight,
  FlaskConical,
  Microscope,
  Sparkles,
  GraduationCap,
  AlertTriangle,
} from "lucide-react";
import {
  clearTokens,
  generateAcademicAiPlan,
  getAcademicState,
  getDashboard,
  hasToken,
  listSubjects,
  type AcademicState,
} from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ServiceNoticeBanner } from "@/components/ui/ServiceNoticeBanner";

type DashRow = Record<string, unknown>;

type Dash = {
  announcements: Array<{ id: string; title: string; body: string; created_at?: string }>;
  homeworks: DashRow[];
  schedule: DashRow[];
  tests: DashRow[];
  degraded?: boolean;
  degraded_sources?: string[];
  service_notice?: string | null;
};

type SubjectCard = {
  id: string;
  name: string;
  slug?: string | null;
  course_number?: number | null;
  semester?: number | null;
};

function str(row: DashRow | null | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === "") continue;
    return String(value);
  }
  return "";
}

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

function homeworkStatus(row: DashRow): string {
  return str(row, "my_status", "submission_status", "status").toLowerCase();
}

function homeworkPending(row: DashRow): boolean {
  const status = homeworkStatus(row);
  return !["submitted", "graded", "done", "сдано", "оценено"].includes(status);
}

function subjectHref(row: DashRow): string | null {
  const id = str(row, "subject_id", "subjectId");
  if (id) return `/subjects/${encodeURIComponent(id)}`;
  return null;
}

export default function DashboardPage() {
  const { user, loading: authLoading, refresh } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [academic, setAcademic] = useState<AcademicState | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectCard[]>([]);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [apiTransport, setApiTransport] = useState<{source:string;fallback:boolean;path:string;at:number}|null>(null);

  useEffect(() => {
    const onTransport = (event: Event) => {
      const detail = (event as CustomEvent<{source?:unknown;fallback?:unknown;path?:unknown;at?:unknown}>).detail;
      if (!detail || typeof detail.source !== "string") return;
      setApiTransport({
        source: detail.source,
        fallback: detail.fallback === true,
        path: typeof detail.path === "string" ? detail.path : "",
        at: typeof detail.at === "number" ? detail.at : Date.now(),
      });
    };
    window.addEventListener("mbh:api-transport", onTransport);
    return () => window.removeEventListener("mbh:api-transport", onTransport);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasToken()) {
        setLoading(false);
        setData(null);
        setAcademic(null);
        setSubjects([]);
        return;
      }
      setLoading(true);
      try {
        const [dashRes, academicRes, subjectsRes] = await Promise.all([
          getDashboard(),
          getAcademicState(),
          listSubjects(user?.course, user?.semester),
        ]);
        if (cancelled) return;

        if (dashRes.ok) {
          const payload = dashRes.data as Dash;
          setData({
            announcements: payload.announcements || [],
            homeworks: payload.homeworks || [],
            schedule: payload.schedule || [],
            tests: payload.tests || [],
            degraded: Boolean(payload.degraded),
            degraded_sources: Array.isArray(payload.degraded_sources) ? payload.degraded_sources : [],
            service_notice: payload.service_notice || null,
          });
          setError(payload.degraded ? payload.service_notice || "Часть блоков главной временно недоступна." : null);
        } else {
          const code = dashRes.error.code || "";
          const msg = dashRes.error.message || "Ошибка загрузки";
          if (/token|auth|unauthorized|bearer/i.test(code + msg) || msg.includes("Bearer")) {
            clearTokens();
            await refresh();
            setError(null);
            setData(null);
          } else {
            setError(msg);
            setData(null);
          }
        }

        if (academicRes.ok) {
          setAcademic(academicRes.data);
          setAcademicError(null);
        } else {
          setAcademic(null);
          setAcademicError(academicRes.error.message || "Академическое состояние недоступно");
        }

        if (subjectsRes.ok) {
          const raw = subjectsRes.data as { items?: SubjectCard[] } | SubjectCard[];
          const items = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
          setSubjects(
            items
              .map((item) => ({
                id: String(item.id || ""),
                name: String(item.name || "Предмет"),
                slug: item.slug,
                course_number: item.course_number ?? null,
                semester: item.semester ?? null,
              }))
              .filter((item) => item.id)
          );
          setSubjectsError(null);
        } else {
          setSubjects([]);
          setSubjectsError(subjectsRes.error.message || "Предметы временно недоступны");
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить данные");
          setData(null);
          setAcademic(null);
          setSubjects([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, user?.course, user?.semester]);

  const name = user?.name?.split(" ")[0] || "студент";

  const generatePlan = async () => {
    setAcademicLoading(true);
    setAcademicError(null);
    setPlanNotice(null);
    try {
      const res = await generateAcademicAiPlan();
      if (!res.ok) throw new Error(res.error.message);
      setAcademic(res.data.source_state);
      const generatedBy = String((res.data.plan as { generated_by?: string } | undefined)?.generated_by || "");
      setPlanNotice(
        generatedBy === "rule_engine"
          ? "План собран по фактам расписания и прогресса. AI-провайдер сейчас недоступен, рекомендации без выдуманных дат."
          : "План подготовки обновлён."
      );
    } catch (e) {
      setAcademicError(e instanceof Error ? e.message : "Не удалось сформировать план");
    } finally {
      setAcademicLoading(false);
    }
  };

  const pendingHw = (data?.homeworks || []).filter(homeworkPending);

  const scheduleSorted = useMemo(() => {
    return [...(data?.schedule || [])]
      .filter((row) => !row.is_cancelled && str(row, "date"))
      .sort((a, b) => {
        const ka = `${str(a, "date")} ${str(a, "start_time", "startTime")}`;
        const kb = `${str(b, "date")} ${str(b, "start_time", "startTime")}`;
        return ka.localeCompare(kb);
      });
  }, [data?.schedule]);

  const { today: khToday, hm: khHm } = khNowParts();
  const todaySchedule = scheduleSorted.filter((row) => str(row, "date") === khToday);
  const todayRemainingSchedule = todaySchedule.filter((row) => (str(row, "end_time", "endTime").slice(0, 5) || str(row, "start_time", "startTime").slice(0, 5) || "00:00") >= khHm);
  const nextFutureDate = scheduleSorted.map((row) => str(row, "date")).find((date) => date > khToday) || null;
  const futureSchedule = nextFutureDate ? scheduleSorted.filter((row) => str(row, "date") === nextFutureDate) : [];
  const dashboardSchedule = todayRemainingSchedule.length > 0 ? todayRemainingSchedule : futureSchedule;
  const scheduleIsToday = todayRemainingSchedule.length > 0;
  const nextScheduleDate = dashboardSchedule[0] ? str(dashboardSchedule[0], "date") : "";
  const nextAfterNow =
    dashboardSchedule.find((row) => {
      const startTime = str(row, "start_time", "startTime").slice(0, 5) || "00:00";
      const date = str(row, "date");
      return date > khToday || (date === khToday && startTime >= khHm);
    }) || null;

  const metrics = academic?.metrics;
  const hasMetrics = Boolean(academic && metrics);
  const testsPreview = (data?.tests || []).slice(0, 4);
  const recs = (academic?.recommendations || []).slice(0, 3);

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
      {error && (
        <ServiceNoticeBanner
          title={data ? "Часть данных главной временно недоступна" : "Главная временно без данных"}
          message={
            (data?.degraded_sources?.length
              ? `${error} Недоступно: ${data.degraded_sources.join(", ")}.`
              : error) + " Никакие тестовые или устаревшие данные не подставляются."
          }
        />
      )}

      <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm sm:p-8">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Сегодня</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Привет, {name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Расписание, предметы, задания и подготовка — в одном месте.
          </p>
          <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm" role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${!apiTransport ? "bg-slate-300" : apiTransport.source === "cloudflare" ? "bg-emerald-500" : apiTransport.source === "spaceweb" ? "bg-amber-500" : apiTransport.source.includes("fallback") ? "bg-amber-500" : "bg-rose-500"}`} />
            <span className="font-semibold text-slate-700">API:</span>
            <span>
              {!apiTransport ? "проверяем источник…" :
                apiTransport.source === "cloudflare" ? "Cloudflare" :
                apiTransport.source === "spaceweb" ? "SpaceWeb (legacy)" :
                apiTransport.source === "spaceweb-fallback" || apiTransport.source === "compatibility-fallback" ? "резервный маршрут: SpaceWeb" :
                apiTransport.source === "cloudflare-unavailable" ? "Cloudflare недоступен" :
                apiTransport.source === "unavailable" ? "бэкенд не настроен" : "источник не определён"}
            </span>
            {apiTransport?.fallback && <span className="rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700">резервный маршрут</span>}
            {apiTransport?.path && <span className="text-slate-400">· последний запрос {apiTransport.path}</span>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/schedule"
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Расписание
            </Link>
            <Link
              href="/subjects"
              className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Предметы
            </Link>
            <Link
              href="/schedule"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Задания
            </Link>
            <Link
              href="/academic"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Учебный план
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Академическое состояние</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Текущий прогресс и подготовка</h2>
            {academic?.session ? (
              <p className="mt-1 text-sm text-slate-500">{String(academic.session.title || "Текущая сессия")}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/academic" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Открыть план
            </Link>
            <button
              type="button"
              onClick={generatePlan}
              disabled={academicLoading}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {academicLoading ? "Анализирую…" : "Сформировать план подготовки"}
            </button>
          </div>
        </div>
        {academicError ? (
          <p className="mt-4 text-sm text-rose-600">{academicError}</p>
        ) : hasMetrics ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Закрыто", metrics.closed ?? 0],
              ["В процессе", metrics.in_progress ?? 0],
              ["Не начато", metrics.not_started ?? 0],
              ["Долги", metrics.debts ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-3">
                <div className="text-xl font-bold text-slate-900">{String(value)}</div>
                <div className="text-xs text-slate-500">{String(label)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Метрики появятся после загрузки академического состояния. Нули не подставляются.</p>
        )}
        {academic && !academic.plan?.available ? (
          <p className="mt-4 text-sm text-amber-700">{academic.plan?.message || "Учебный план ещё не загружен."}</p>
        ) : null}
        {recs.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-800">Что сейчас важно</p>
            {recs.map((r, i) => {
              const href = r.subject_id ? `/subjects/${encodeURIComponent(String(r.subject_id))}` : "/academic";
              return (
                <Link
                  key={String(r.schedule_entry_id || r.topic_id || i)}
                  href={href}
                  className="block rounded-xl border border-slate-100 p-3 text-sm hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <span className="font-medium text-slate-900">{String(r.title || "Подготовка")}</span>
                  <span className="ml-2 text-slate-500">{String(r.reason || "")}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
        {planNotice ? <p className="mt-3 text-sm text-emerald-700">{planNotice}</p> : null}
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
                  const title = str(row, "subject_name", "subject", "title") || "Занятие";
                  const startTime = str(row, "start_time", "startTime").slice(0, 5) || "—";
                  const endTime = str(row, "end_time", "endTime").slice(0, 5);
                  const room = str(row, "room");
                  const teacher = str(row, "teacher");
                  const href = subjectHref(row);
                  const isNext = nextAfterNow && str(nextAfterNow, "id") === str(row, "id");
                  const inner = (
                    <>
                      <div className="font-semibold text-slate-900">{title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {startTime}
                          {endTime ? `–${endTime}` : ""}
                        </span>
                        {room ? <span>ауд. {room}</span> : null}
                        {teacher ? <span>{teacher}</span> : null}
                      </div>
                    </>
                  );
                  const className = `rounded-xl border p-3 ${isNext ? "border-indigo-200 bg-indigo-50/50" : "border-slate-100 bg-slate-50/50"}`;
                  return href ? (
                    <Link key={str(row, "id") || String(index)} href={href} className={`${className} block hover:border-indigo-300`}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={str(row, "id") || String(index)} className={className}>
                      {inner}
                    </div>
                  );
                })}
                {dashboardSchedule.length > 8 ? (
                  <p className="pt-1 text-xs text-slate-500">Ещё {dashboardSchedule.length - 8} занятия — в расписании.</p>
                ) : null}
                <Link href="/schedule" className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-indigo-600">
                  Открыть расписание <ChevronRight className="h-4 w-4" />
                </Link>
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
            <ul className="mt-3 space-y-2">
              {pendingHw.slice(0, 3).map((hw, i) => (
                <li key={str(hw, "id") || String(i)} className="text-sm text-slate-700">
                  {str(hw, "title") || "Задание"}
                  {str(hw, "due_at") ? <span className="text-slate-400"> · до {str(hw, "due_at").slice(0, 10)}</span> : null}
                </li>
              ))}
            </ul>
            <Link href="/schedule" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
              Все задания <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600">
              <BookOpen className="h-4 w-4" /> Тесты
            </div>
            <div className="text-3xl font-bold text-indigo-600">{(data?.tests || []).length}</div>
            <p className="text-sm text-slate-500">доступно</p>
            <ul className="mt-3 space-y-2">
              {testsPreview.map((test, i) => (
                <li key={str(test, "id") || String(i)}>
                  <Link
                    href={str(test, "id") ? `/tests?open=${encodeURIComponent(str(test, "id"))}` : "/tests"}
                    className="text-sm font-medium text-slate-800 hover:text-indigo-700"
                  >
                    {str(test, "title", "name") || "Тест"}
                    {str(test, "subject_name") ? <span className="font-normal text-slate-400"> · {str(test, "subject_name")}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/tests" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
              К тестам <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-800">Мои предметы</h3>
          <Link href="/subjects" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
            Все предметы <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {subjectsError ? (
          <p className="text-sm text-rose-600">{subjectsError}</p>
        ) : subjects.length === 0 ? (
          <p className="text-sm text-slate-500">Предметы курса появятся после загрузки каталога. Демо-список не подставляется.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.slice(0, 6).map((subject) => (
              <Link
                key={subject.id}
                href={`/subjects/${encodeURIComponent(subject.id)}`}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 hover:border-indigo-200 hover:bg-indigo-50/40"
              >
                <div className="font-medium text-slate-900">{subject.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {subject.course_number ? `${subject.course_number} курс` : ""}
                  {subject.semester ? ` · ${subject.semester} семестр` : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/trainers" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Microscope className="h-4 w-4 text-indigo-500" /> Тренажёр
          </Link>
          <Link href="/chemistry" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FlaskConical className="h-4 w-4 text-indigo-500" /> Химия
          </Link>
          <Link href="/tutor" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Sparkles className="h-4 w-4 text-indigo-500" /> AI-тьютор
          </Link>
          <Link href="/progress" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <GraduationCap className="h-4 w-4 text-indigo-500" /> Прогресс
          </Link>
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
                <li key={str(hw, "id") || String(i)}>
                  <Link href="/schedule" className="block rounded-xl border border-slate-100 bg-slate-50/80 p-3 hover:border-indigo-200">
                    <div className="font-medium text-slate-900">{str(hw, "title") || "Задание"}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {str(hw, "due_at") ? `до ${str(hw, "due_at").slice(0, 10)}` : ""}
                      {homeworkStatus(hw) ? ` · ${homeworkStatus(hw)}` : ""}
                    </div>
                  </Link>
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
                <li key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <div className="font-medium text-slate-900">{a.title}</div>
                  <p className="mt-1 text-sm text-slate-600">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {academic?.debts?.length ? (
        <section className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4" /> Академические долги
          </div>
          <ul className="space-y-2">
            {academic.debts.slice(0, 5).map((debt, i) => (
              <li key={String(debt.id || i)} className="text-sm text-slate-800">
                <span className="font-medium">{String(debt.subject_name || "Предмет")}</span>
                {debt.note ? <span className="text-slate-500"> · {String(debt.note)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
