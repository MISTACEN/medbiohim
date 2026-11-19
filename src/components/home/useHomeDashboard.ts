"use client";

/**
 * Состояние главной: загрузка дашборда, академическое состояние, раскладка
 * виджетов, источник API и сводка «сегодня / завтра». Разметка — в панелях.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nowParts as sharedNowParts, lessonStartMinutes } from "@/lib/now-parts";
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
import { describeApiError } from "@/lib/errors";
import {
  defaultHomeLayout,
  loadLocalHome,
  loadRemoteHome,
  saveLocalHome,
  saveRemoteHome,
  type HomePreferences,
  type HomeSyncState,
} from "@/lib/home-layout";
import {
  EMPTY_BUNDLE,
  EMPTY_CATALOG,
  EMPTY_EXAM_WINDOWS,
  EMPTY_SUBJECTS,
  EXAM_HIGHLIGHT_DAYS,
  controlInfo,
  datePlusDays,
  homeworkPending,
  str,
  type CatalogRow,
  type DashboardBundle,
  type ExamWindow,
} from "@/components/home/dashboard-model";

/** Предмет для сетки главной: тип аттестации и ближайшая сессия. */
export type HomeSubjectView = {
  subject: SubjectCard;
  control: { label: string; isExam: boolean } | null;
  examDate: Date | null;
};

export type HomeDashboardState = ReturnType<typeof useHomeDashboard>;

export function useHomeDashboard() {
  const { user, loading: authLoading, refresh } = useAuth();
  const router = useRouter();
  // Директива владельца: учитель после входа попадает сразу на рабочее место —
  // студенческую главную он не видит вообще.
  useEffect(() => {
    if (!authLoading && user?.role === "teacher") router.replace("/teacher");
  }, [authLoading, user?.role, router]);

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
  const [apiTransport, setApiTransport] = useState<{ source: string; fallback: boolean; path: string; at: number } | null>(null);

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
  const subjects = bundle?.subjects ?? EMPTY_SUBJECTS;
  const subjectsError = bundle?.subjectsError ?? null;

  useEffect(() => {
    const onTransport = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: unknown; fallback?: unknown; path?: unknown; at?: unknown }>).detail;
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
    // Расписания дальше нет: показываем сегодня с его парами, а не пустое «завтра».
    return { date: kh.date, rows: todayRows, isToday: true };
  }, [todayRows, todayAllOver, tomorrowRows, tomorrowDate, scheduleSorted, kh.date]);
  const summaryIsTomorrow = !summary.isToday && summary.date === tomorrowDate;

  // --- Предметы с аттестацией сверху ----------------------------------------
  const catalogById = bundle?.catalog ?? EMPTY_CATALOG;
  const examWindows = bundle?.examWindows ?? EMPTY_EXAM_WINDOWS;
  const subjectsView = useMemo<HomeSubjectView[]>(() => {
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
  }, [subjects, catalogById, examWindows, kh.date]);

  const metrics = academic?.metrics;
  const testsPreview = (data?.tests || []).slice(0, 4);

  return {
    user,
    authLoading,
    loading,
    error,
    data,
    academic,
    academicError,
    metrics,
    planNotice,
    academicLoading,
    generatePlan,
    subjects,
    subjectsError,
    subjectsView,
    summary,
    summaryIsTomorrow,
    activeHomeworks,
    testsPreview,
    apiTransport,
    homePrefs,
    homeSync,
    applyHome,
    hasToken: hasToken(),
  };
}
