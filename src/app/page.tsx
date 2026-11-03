"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { nowParts as sharedNowParts, lessonStartMinutes } from "@/lib/now-parts";
import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  ChevronRight,
  FlaskConical,
  Microscope,
  Sparkles,
  GraduationCap,
  AlertTriangle,
  Landmark,
} from "lucide-react";
import {
  clearTokens,
  generateAcademicAiPlan,
  getAcademicState,
  getDashboard,
  getScheduleMeta,
  hasToken,
  listSubjects,
  listSubjectsCatalog,
  type AcademicState,
  type Dashboard,
} from "@/lib/api";
import type { SubjectCard } from "@/lib/guards";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ServiceNoticeBanner } from "@/components/ui/ServiceNoticeBanner";
import { describeApiError } from "@/lib/errors";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { TodaySummary } from "@/components/home/TodaySummary";
import {
  defaultHomeLayout,
  loadLocalHome,
  loadRemoteHome,
  saveLocalHome,
  saveRemoteHome,
  type HomePreferences,
  type HomeSyncState,
  type HomeWidgetId,
} from "@/lib/home-layout";

type DashRow = Record<string, unknown>;

/** Строка каталога предметов: источник control_type и slug (как на /subjects). */
type CatalogRow = {
  id: string;
  control_type?: string | null;
  slug?: string | null;
  course_number?: number | null;
  semester?: number | null;
};

/** Окно экзаменационной сессии из getScheduleMeta → periods. */
type ExamWindow = { start: string; end: string };

/** Сколько дней до сессии считаем «аттестация близко» (как на /subjects). */
const EXAM_HIGHLIGHT_DAYS = 90;

/**
 * D9: совокупный результат загрузки главной — один объект на несколько
 * параллельных запросов (dashboard, academic state, subjects, каталог, сессии).
 */
type DashboardBundle = {
  dash: Dashboard | null;
  dashError: string | null;
  academic: AcademicState | null;
  academicError: string | null;
  subjects: SubjectCard[];
  subjectsError: string | null;
  /** Каталог предметов по id — источник control_type для бейджей аттестации. */
  catalog: Record<string, CatalogRow>;
  /** Окна экзаменационных сессий курса/семестра пользователя. */
  examWindows: ExamWindow[];
};

const EMPTY_BUNDLE: DashboardBundle = {
  dash: null,
  dashError: null,
  academic: null,
  academicError: null,
  subjects: [],
  subjectsError: null,
  catalog: {},
  examWindows: [],
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

// FD8: единые «сейчас» и «ближайшая пара» с расписанием — src/lib/now-parts.ts

/** YYYY-MM-DD в таймзоне платформы + N дней (без переходов через Intl). */
function datePlusDays(parts: { year: number; month: number; day: number }, days: number): string {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function homeworkStatus(row: DashRow): string {
  return str(row, "my_status", "submission_status", "status").toLowerCase();
}

function homeworkPending(row: DashRow): boolean {
  const status = homeworkStatus(row);
  return !["submitted", "graded", "done", "сдано", "оценено"].includes(status);
}

/**
 * Тип аттестации предмета. control_type в БД хранится русским текстом
 * («Зачет»/«Экзамен») или ключом (credit/exam) — как на /subjects.
 */
function controlInfo(raw: unknown): { label: string; isExam: boolean } | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/диф.*зач|^дифф/i.test(text)) return { label: "Дифф. зачёт", isExam: false };
  if (/зач|^credit$/.test(lower)) return { label: "Зачёт", isExam: false };
  if (/экз|^exam$/.test(lower)) return { label: "Экзамен", isExam: true };
  return { label: text, isExam: false };
}

export default function DashboardPage() {
  const { user, loading: authLoading, refresh } = useAuth();
  // D9: ручной useEffect с cancelled-флагом заменён на useApiRequest —
  // запросы отменяются через AbortSignal при unmount и смене зависимостей.
  const { data: bundle, loading, error: loadError } = useApiRequest<DashboardBundle>(
    async (signal) => {
      if (!hasToken()) return EMPTY_BUNDLE;
      try {
        const [dashRes, academicRes, subjectsRes, catalogRes, metaRes] = await Promise.all([
          getDashboard({ signal }),
          getAcademicState({ signal }),
          listSubjects(user?.course, user?.semester, { signal }),
          listSubjectsCatalog({ signal }),
          getScheduleMeta(undefined, undefined, { signal }),
        ]);

        let dash: Dashboard | null = null;
        let dashError: string | null = null;
        if (dashRes.ok) {
          const payload = dashRes.data;
          dash = {
            announcements: payload.announcements || [],
            homeworks: payload.homeworks || [],
            schedule: payload.schedule || [],
            tests: payload.tests || [],
            degraded: Boolean(payload.degraded),
            degraded_sources: Array.isArray(payload.degraded_sources) ? payload.degraded_sources : [],
            service_notice: payload.service_notice || null,
          };
          dashError = payload.degraded ? payload.service_notice || "Часть блоков главной временно недоступна." : null;
        } else {
          const code = dashRes.error.code || "";
          const msg = describeApiError(dashRes.error) || "Ошибка загрузки";
          if (/token|auth|unauthorized|bearer/i.test(code + msg) || msg.includes("Bearer")) {
            clearTokens();
            await refresh();
          } else {
            dashError = msg;
          }
        }

        let academic: AcademicState | null = null;
        let academicError: string | null = null;
        if (academicRes.ok) {
          academic = academicRes.data;
        } else {
          academicError = describeApiError(academicRes.error) || "Академическое состояние недоступно";
        }

        let subjects: SubjectCard[] = [];
        let subjectsError: string | null = null;
        if (subjectsRes.ok) {
          const raw = subjectsRes.data as { items?: SubjectCard[] } | SubjectCard[];
          const items = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
          subjects = items
            .map((item) => ({
              id: String(item.id || ""),
              name: String(item.name || "Предмет"),
              slug: item.slug,
              course_number: item.course_number ?? null,
              semester: item.semester ?? null,
            }))
            .filter((item) => item.id);
        } else {
          subjectsError = describeApiError(subjectsRes.error) || "Предметы временно недоступны";
        }

        // Каталог предметов: нужен только control_type/slug по id — не критичен,
        // при ошибке главная просто показывает предметы без бейджей аттестации.
        const catalog: Record<string, CatalogRow> = {};
        if (catalogRes.ok) {
          const raw = catalogRes.data as { items?: CatalogRow[] } | CatalogRow[] | null;
          const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
          for (const item of items) {
            if (item && typeof item === "object" && typeof item.id === "string" && item.id) {
              catalog[item.id] = item;
            }
          }
        }

        // Окна экзаменационных сессий курса/семестра пользователя — для дат
        // в бейджах «Экзамен · …». Периоды без курса/семестра не отбрасываем.
        const examWindows: ExamWindow[] = [];
        if (metaRes.ok) {
          const periods = (metaRes.data as { periods?: Record<string, unknown>[] } | null)?.periods;
          if (Array.isArray(periods)) {
            for (const p of periods) {
              if (!p || typeof p !== "object") continue;
              if (String(p.type || "") !== "exam_session" || !p.start_date) continue;
              if (user?.course != null && p.course_number != null && Number(p.course_number) !== user.course) continue;
              if (user?.semester != null && p.semester != null && Number(p.semester) !== user.semester) continue;
              examWindows.push({ start: String(p.start_date), end: String(p.end_date || p.start_date) });
            }
            examWindows.sort((a, b) => a.start.localeCompare(b.start));
          }
        }

        return { dash, dashError, academic, academicError, subjects, subjectsError, catalog, examWindows };
      } catch {
        // Оригинальное поведение: общий текст и пустые блоки без частичных данных.
        throw new Error("Не удалось загрузить данные");
      }
    },
    [refresh, user?.course, user?.semester]
  );

  const [generatedAcademic, setGeneratedAcademic] = useState<AcademicState | null>(null);
  const [academicErrorOverride, setAcademicErrorOverride] = useState<string | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [apiTransport, setApiTransport] = useState<{source:string;fallback:boolean;path:string;at:number}|null>(null);

  // Раскладка главной: локальная копия отвечает сразу, затем подтягивается
  // серверная (если пользователь менял блоки на другом устройстве).
  const [homePrefs, setHomePrefs] = useState<HomePreferences>(() => ({
    layout: defaultHomeLayout(),
    note: "",
  }));
  const [homeSync, setHomeSync] = useState<HomeSyncState>("idle");
  const homeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const local = loadLocalHome(user?.id);
    if (local) setHomePrefs(local);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !hasToken()) return;
    let cancelled = false;
    void loadRemoteHome().then((remote) => {
      if (cancelled || !remote) return;
      setHomePrefs(remote);
      saveLocalHome(remote, user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(
    () => () => {
      if (homeSaveTimer.current) clearTimeout(homeSaveTimer.current);
    },
    []
  );

  const applyHome = useCallback(
    (next: HomePreferences) => {
      setHomePrefs(next);
      saveLocalHome(next, user?.id);
      setHomeSync("saving");
      if (homeSaveTimer.current) clearTimeout(homeSaveTimer.current);
      homeSaveTimer.current = setTimeout(() => {
        if (!hasToken()) {
          setHomeSync("local");
          return;
        }
        void saveRemoteHome(next).then((saved) => setHomeSync(saved ? "saved" : "error"));
      }, 700);
    },
    [user?.id]
  );

  // Сгенерированный план и его ошибка действуют только до следующей загрузки состояния.
  useEffect(() => {
    setGeneratedAcademic(null);
    setAcademicErrorOverride(null);
  }, [bundle]);

  const data = bundle?.dash ?? null;
  const error = loadError ?? bundle?.dashError ?? null;
  const academic = generatedAcademic ?? bundle?.academic ?? null;
  const academicError = academicErrorOverride ?? bundle?.academicError ?? null;
  const subjects = bundle?.subjects ?? [];
  const subjectsError = bundle?.subjectsError ?? null;

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

  const name = user?.name?.split(" ")[0] || "студент";

  const generatePlan = async () => {
    setAcademicLoading(true);
    setAcademicErrorOverride(null);
    setPlanNotice(null);
    try {
      const res = await generateAcademicAiPlan();
      if (!res.ok) throw new Error(describeApiError(res.error));
      setGeneratedAcademic(res.data.source_state);
      const generatedBy = String((res.data.plan as { generated_by?: string } | undefined)?.generated_by || "");
      setPlanNotice(
        generatedBy === "rule_engine"
          ? "План собран по фактам расписания и прогресса. AI-провайдер сейчас недоступен, рекомендации без выдуманных дат."
          : "План подготовки обновлён."
      );
    } catch (e) {
      setAcademicErrorOverride(e instanceof Error ? e.message : "Не удалось сформировать план");
    } finally {
      setAcademicLoading(false);
    }
  };

  const activeHomeworks = (data?.homeworks || []).filter(homeworkPending);

  const scheduleSorted = useMemo(() => {
    return [...(data?.schedule || [])]
      .filter((row) => !row.is_cancelled && str(row, "date"))
      .sort((a, b) => {
        const ka = `${str(a, "date")} ${str(a, "start_time", "startTime")}`;
        const kb = `${str(b, "date")} ${str(b, "start_time", "startTime")}`;
        return ka.localeCompare(kb);
      });
  }, [data?.schedule]);

  // --- Совмещённый блок «Сегодня / Завтра» ----------------------------------
  // Пока сегодня есть незаконченные пары — показываем сегодня; после последней
  // пары — завтра; если завтра пусто — следующий день с занятиями.
  const kh = sharedNowParts();
  const todayRows = useMemo(
    () => scheduleSorted.filter((row) => str(row, "date") === kh.date),
    [scheduleSorted, kh.date]
  );
  const tomorrowDate = datePlusDays(kh, 1);
  const tomorrowRows = useMemo(
    () => scheduleSorted.filter((row) => str(row, "date") === tomorrowDate),
    [scheduleSorted, tomorrowDate]
  );
  const todayAllOver =
    todayRows.length > 0 &&
    todayRows.every((row) => {
      // Неизвестное время конца не считается «прошедшим»: врать про закончившийся
      // день хуже, чем лишний раз показать сегодняшний день.
      const end = lessonStartMinutes(str(row, "end_time", "endTime"));
      return end !== null && end < kh.minutes;
    });

  const summary = useMemo(() => {
    if (todayRows.length > 0 && !todayAllOver) {
      return { date: kh.date, rows: todayRows, isToday: true };
    }
    if (tomorrowRows.length > 0) {
      return { date: tomorrowDate, rows: tomorrowRows, isToday: false };
    }
    const nextDate = scheduleSorted.map((row) => str(row, "date")).find((d) => d > kh.date) || "";
    if (nextDate) {
      return { date: nextDate, rows: scheduleSorted.filter((row) => str(row, "date") === nextDate), isToday: false };
    }
    // Расписание кончилось: держим завтра с пустым списком, виджет честно скажет.
    return { date: tomorrowDate, rows: [] as typeof todayRows, isToday: false };
  }, [todayRows, todayAllOver, tomorrowRows, tomorrowDate, scheduleSorted, kh.date]);
  const summaryIsTomorrow = !summary.isToday && summary.date === tomorrowDate;

  // --- Предметы с аттестацией сверху ----------------------------------------
  const catalogById = bundle?.catalog ?? {};
  const examWindows = bundle?.examWindows ?? [];
  const subjectsView = useMemo(() => {
    const today = new Date(`${kh.date}T00:00:00`);
    const enriched = subjects.map((subject) => {
      const control = controlInfo(catalogById[subject.id]?.control_type);
      let examDate: Date | null = null;
      if (control) {
        for (const window of examWindows) {
          const start = new Date(`${window.start}T00:00:00`);
          const end = new Date(`${window.end}T23:59:59`);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
          if (today > end) continue; // сессия уже прошла
          const from = new Date(start);
          from.setDate(from.getDate() - EXAM_HIGHLIGHT_DAYS);
          if (today < from) continue; // до сессии ещё далеко
          examDate = start;
          break;
        }
      }
      return { subject, control, examDate };
    });
    const withExam = enriched
      .filter((x) => x.control && x.examDate)
      .sort((a, b) => (a.examDate as Date).getTime() - (b.examDate as Date).getTime());
    const controlOnly = enriched.filter((x) => x.control && !x.examDate);
    const rest = enriched.filter((x) => !x.control);
    return [...withExam, ...controlOnly, ...rest];
    // kh.date — строка YYYY-MM-DD, меняется раз в сутки; сам nowParts в deps не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, catalogById, examWindows, kh.date]);

  const metrics = academic?.metrics;
  const testsPreview = (data?.tests || []).slice(0, 4);

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <SkeletonCards count={3} />
      </div>
    );
  }

  if (!hasToken() || !user) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Медбиохим</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Войдите, чтобы видеть расписание, задания и прогресс
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
          >
            Регистрация
          </Link>
        </div>
      </div>
    );
  }

  const widgetNodes: Partial<Record<HomeWidgetId, ReactNode>> = {
    today: (
      <TodaySummary
        date={summary.date}
        isToday={summary.isToday}
        isTomorrow={summaryIsTomorrow}
        lessons={summary.rows}
        homeworks={activeHomeworks}
        events={academic?.upcoming || []}
        subjects={subjects}
      />
    ),

    academic: (
      <section className="h-full rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Академическое состояние</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Текущий прогресс и подготовка</h2>
            {academic?.session ? (
              <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{String(academic.session.title || "Текущая сессия")}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/academic" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              Открыть план
            </Link>
            <button
              type="button"
              onClick={generatePlan}
              disabled={academicLoading}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {academicLoading ? "Анализирую…" : "Сформировать план подготовки"}
            </button>
          </div>
        </div>
        {academicError ? (
          <p className="mt-4 text-sm text-[var(--status-critical-fg)]">{academicError}</p>
        ) : metrics ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Закрыто", metrics?.closed ?? 0],
              ["В процессе", metrics?.in_progress ?? 0],
              ["Не начато", metrics?.not_started ?? 0],
              ["Долги", metrics?.debts ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{String(value)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{String(label)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Метрики появятся после загрузки академического состояния. Нули не подставляются.</p>
        )}
        {academic && !academic.plan?.available ? (
          <p className="mt-4 text-sm text-[var(--status-warn-fg)]">{academic.plan?.message || "Учебный план ещё не загружен."}</p>
        ) : null}
        {planNotice ? <p className="mt-3 text-sm text-[var(--status-ok-fg)]">{planNotice}</p> : null}
      </section>
    ),

    tests: (
      <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          <BookOpen className="h-4 w-4" /> Тесты
        </div>
        <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{(data?.tests || []).length}</div>
        <p className="text-sm text-slate-500 dark:text-slate-400">доступно</p>
        <ul className="mt-3 space-y-2">
          {testsPreview.map((test, i) => (
            <li key={str(test, "id") || String(i)}>
              <Link
                href={str(test, "id") ? `/tests?open=${encodeURIComponent(str(test, "id"))}` : "/tests"}
                className="text-sm font-medium text-slate-800 hover:text-indigo-700 dark:text-slate-200 dark:hover:text-indigo-400"
              >
                {str(test, "title", "name") || "Тест"}
                {str(test, "subject_name") ? <span className="font-normal text-slate-400 dark:text-slate-500"> · {str(test, "subject_name")}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/tests" className="mt-3 inline-flex min-h-[40px] items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          К тестам <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    ),

    subjects: (
      <section className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Мои предметы</h3>
          <Link href="/subjects" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Все предметы <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {subjectsError ? (
          <p className="text-sm text-[var(--status-critical-fg)]">{subjectsError}</p>
        ) : subjects.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Предметы курса появятся после загрузки каталога. Демо-список не подставляется.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {subjectsView.slice(0, 8).map(({ subject, control, examDate }) => {
              const dateLabel = examDate
                ? examDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
                : "";
              return (
                <Link
                  key={subject.id}
                  href={`/subjects/${encodeURIComponent(subject.id)}`}
                  className="flex min-w-0 flex-col rounded-xl border border-slate-100 bg-slate-50/80 p-3 hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
                >
                  <div className="break-words font-medium text-slate-900 dark:text-slate-100">{subject.name}</div>
                  {control ? (
                    <span
                      className={`mt-1.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        control.isExam
                          ? "bg-rose-600 text-white dark:bg-rose-500"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200"
                      }`}
                    >
                      {control.label}
                      {dateLabel ? ` · сессия с ${dateLabel}` : ""}
                    </span>
                  ) : null}
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {subject.course_number ? `${subject.course_number} курс` : ""}
                    {subject.semester ? ` · ${subject.semester} семестр` : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/subjects/physiology/lessons" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
            <BookOpen className="h-4 w-4 text-[var(--status-ok-fg)]" /> Практикум по физиологии
          </Link>
          <Link href="/trainers" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
            <Microscope className="h-4 w-4 text-indigo-500" /> Тренажёр
          </Link>
          <Link href="/chemistry" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
            <FlaskConical className="h-4 w-4 text-indigo-500" /> Химия
          </Link>
          <Link href="/tutor" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
            <Sparkles className="h-4 w-4 text-indigo-500" /> AI-тьютор
          </Link>
          <Link href="/progress" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
            <GraduationCap className="h-4 w-4 text-indigo-500" /> Прогресс
          </Link>
        </div>
      </section>
    ),

    homeworkList: (
      <section className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">Задания</h3>
        {(data?.homeworks || []).length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Пока нет заданий</p>
        ) : (
          <ul className="space-y-3">
            {(data?.homeworks || []).slice(0, 6).map((hw, i) => (
              <li key={str(hw, "id") || String(i)}>
                <Link href="/homework" className="block rounded-xl border border-slate-100 bg-slate-50/80 p-3 hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-500/40">
                  <div className="break-words font-medium text-slate-900 dark:text-slate-100">{str(hw, "title") || "Задание"}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {str(hw, "due_at") ? `до ${str(hw, "due_at").slice(0, 10)}` : ""}
                    {homeworkStatus(hw) ? ` · ${homeworkStatus(hw)}` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),

    announcements: (
      <section className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">Объявления</h3>
        {(data?.announcements || []).length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Нет объявлений</p>
        ) : (
          <ul className="space-y-3">
            {(data?.announcements || []).map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="break-words font-medium text-slate-900 dark:text-slate-100">{a.title}</div>
                <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),

    debts: academic?.debts?.length ? (
      <section className="h-full rounded-2xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/40 p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--status-critical-fg)]">
          <AlertTriangle className="h-4 w-4" /> Академические долги
        </div>
        <ul className="space-y-2">
          {academic.debts.slice(0, 5).map((debt, i) => (
            <li key={String(debt.id || i)} className="text-sm text-slate-800 dark:text-slate-200">
              <span className="font-medium">{String(debt.subject_name || "Предмет")}</span>
              {debt.note ? <span className="text-slate-500 dark:text-slate-400"> · {String(debt.note)}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    ) : undefined,

    note: (
      <section className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          <ClipboardList className="h-4 w-4" /> Заметка
        </div>
        <textarea
          value={homePrefs.note}
          onChange={(event) => applyHome({ ...homePrefs, note: event.target.value.slice(0, 4000) })}
          placeholder="Что не забыть сегодня…"
          rows={5}
          className="min-h-[120px] w-full flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:border-indigo-500/50 dark:focus:bg-slate-800"
        />
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Видна только вам и сохраняется в аккаунте.</p>
      </section>
    ),
  };

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

      <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-8 dark:border-slate-700/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Сегодня</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Привет, {name}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Расписание, предметы, задания и подготовка — в одном месте.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="academic-identity">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
              <GraduationCap className="h-3.5 w-3.5 text-indigo-500" />
              Группа:{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {user?.groupName || user?.groupCode || "не назначена"}
              </span>
            </span>
            <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
              Курс:{" "}
              <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">
                {user?.course != null ? user.course : "—"}
              </span>
            </span>
            <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
              Семестр:{" "}
              <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">
                {user?.semester != null ? user.semester : "—"}
              </span>
            </span>
            {!user?.groupId ? (
              <span className="text-xs text-[var(--status-warn-fg)]">Админ может назначить группу в разделе «Пользователи»</span>
            ) : null}
          </div>

          <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300" role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${!apiTransport ? "bg-slate-300" : apiTransport.source === "cloudflare" ? "bg-[var(--status-ok-fg)]" : apiTransport.source === "spaceweb" ? "bg-[var(--status-warn-fg)]" : apiTransport.source.includes("fallback") ? "bg-[var(--status-warn-fg)]" : "bg-[var(--status-critical-fg)]"}`} />
            <span className="font-semibold text-slate-700 dark:text-slate-200">API:</span>
            <span>
              {!apiTransport ? "проверяем источник…" :
                apiTransport.source === "cloudflare" ? "Cloudflare" :
              apiTransport.source.includes("fallback") ? "совместимый резервный маршрут Cloudflare" :
                apiTransport.source === "cloudflare-unavailable" ? "Cloudflare недоступен" :
                apiTransport.source === "unavailable" ? "бэкенд не настроен" : "источник не определён"}
            </span>
            {apiTransport?.fallback && <span className="rounded-md bg-[var(--status-warn-bg)] px-2 py-0.5 font-medium text-[var(--status-warn-fg)]">резервный маршрут</span>}
            {apiTransport?.path && <span className="text-slate-400 dark:text-slate-500">· последний запрос {apiTransport.path}</span>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/schedule"
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Расписание
            </Link>
            <Link
              href="/subjects"
              className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
            >
              Предметы
            </Link>
            <Link
              href="/homework"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Задания
            </Link>
            <Link
              href="/assignments"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Отработки
            </Link>
            <Link
              href="/academic"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Учебный план
            </Link>
            <Link
              href="/university"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
            >
              <Landmark className="h-4 w-4" /> Вуз и ЕИОС
            </Link>
          </div>
        </div>
      </section>

      <HomeDashboard
        layout={homePrefs.layout}
        note={homePrefs.note}
        sync={homeSync}
        widgets={widgetNodes}
        onChange={(layout) => applyHome({ ...homePrefs, layout })}
        onReset={() => applyHome({ layout: defaultHomeLayout(), note: "" })}
      />
    </div>
  );
}
