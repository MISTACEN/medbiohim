"use client";

/**
 * «План подготовки» — рабочая страница, а не пересказ ДЗ.
 *
 * Механика:
 *  1. Программа (блоки, задачи, сроки) лежит в `@/lib/study/program` как данные.
 *  2. Студент отмечает сданное — из отметок пересобираются «ход сдачи» и план
 *     по дням. Перегруз дня и просрочки не прячутся.
 *  3. Сайтовый AI переписывает акценты, порядок блоков и советы; даты и состав
 *     задач он менять не может — в патч попадают только известные дни/блоки.
 *  4. Отработки дополнительно синхронизируются с трекером /assignments.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Loader2,
  Printer,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  hasToken,
  listMyAssignments,
  saveMyAssignments,
  updateMyAssignment,
  type MyAssignment,
  type MyAssignmentStatus,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { aiChat } from "@/lib/features-api";
import {
  HISTOLOGY_PROGRAM,
  KR_DATE_DEFAULT,
  STUDY_SEED_PATCH,
  buildAiPromptV2,
  buildRoadmap,
  buildStudyPlanV2,
  orderRoadmap,
  parseAiPlanV2,
  progressOf,
  toIcs,
  type AiPlanPatch,
} from "@/lib/study/program";
import { ProgramOverview } from "@/components/study/ProgramOverview";
import { PlanDays, PlanPrintSheet } from "@/components/study/PlanDays";
import {
  ElectronogramPrintSheet,
  Electronograms,
  type Electronogram,
  type NerveElectronogram,
} from "@/components/study/Electronograms";
import { StudyTrainer } from "@/components/study/StudyTrainer";

const DONE_KEY = "study.program.done.v2";
const KR_KEY = "study.program.krDate.v2";
const STATUS_LABEL: Record<MyAssignmentStatus, string> = {
  pending: "Ожидает",
  retake_needed: "На отработку",
  passed: "Сдано",
  failed: "Не сдано",
};

type Tab = "overview" | "plan" | "em" | "tests";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим — прогресс не сохранится, но страница работает */
  }
}

function fingerprint(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

function topicFor(block: { short: string }): string {
  return block.short;
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .study-print, .study-print * { visibility: visible !important; }
  .study-print { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
  @page { size: A4; margin: 12mm; }
}`;

export function StudySection() {
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [todayIso, setTodayIso] = useState("");
  const [nowHour, setNowHour] = useState(12);
  const [tab, setTab] = useState<Tab>("overview");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [krDate, setKrDate] = useState(KR_DATE_DEFAULT);
  const [patch, setPatch] = useState<AiPlanPatch | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "unavailable">("idle");
  const [printTarget, setPrintTarget] = useState<"em" | "plan" | null>(null);
  const [ems, setEms] = useState<Electronogram[]>([]);
  const [nerveEms, setNerveEms] = useState<NerveElectronogram[]>([]);
  const [emsError, setEmsError] = useState("");

  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsSettled, setAssignmentsSettled] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const aiRun = useRef(0);

  // Дата и время — только на клиенте: иначе SSR и гидратация разойдутся на границе суток.
  useEffect(() => {
    const current = new Date();
    setTodayIso(
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`,
    );
    setNowHour(current.getHours());
    setDone(readJson<Record<string, boolean>>(DONE_KEY, {}));
    const savedKr = readJson<string>(KR_KEY, KR_DATE_DEFAULT);
    setKrDate(/^\d{4}-\d{2}-\d{2}$/.test(savedKr) ? savedKr : KR_DATE_DEFAULT);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) writeJson(DONE_KEY, done);
  }, [done, mounted]);

  useEffect(() => {
    if (mounted) writeJson(KR_KEY, krDate);
  }, [krDate, mounted]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [kr, nerve] = await Promise.all([
          fetch("/content/study/electronograms.json").then((response) => response.json()),
          fetch("/content/study/nerve-electronograms.json").then((response) => response.json()),
        ]);
        if (cancelled) return;
        setEms(Array.isArray(kr) ? (kr as Electronogram[]) : []);
        setNerveEms(Array.isArray(nerve) ? (nerve as NerveElectronogram[]) : []);
      } catch {
        if (!cancelled) setEmsError("Не удалось загрузить электронограммы. Открой страницу через сайт, а не как файл.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!hasToken()) {
      setAssignmentsSettled(true);
      return;
    }
    setAssignmentsLoading(true);
    void (async () => {
      const result = await listMyAssignments();
      if (result.ok) {
        setAssignments(Array.isArray(result.data?.items) ? (result.data.items as MyAssignment[]) : []);
      } else {
        setAssignmentsError(describeApiError(result.error));
      }
      setAssignmentsLoading(false);
      setAssignmentsSettled(true);
    })();
  }, [authLoading]);

  const plan = useMemo(() => {
    if (!mounted) return null;
    return buildStudyPlanV2({
      program: HISTOLOGY_PROGRAM,
      done,
      today: new Date(`${todayIso}T12:00:00`),
      now: new Date(`${todayIso}T${String(nowHour).padStart(2, "0")}:00:00`),
      krDate,
      assignments,
    });
  }, [mounted, done, todayIso, nowHour, krDate, assignments]);

  const roadmap = useMemo(() => {
    if (!mounted) return [];
    return buildRoadmap({ program: HISTOLOGY_PROGRAM, done, today: todayIso, krDate });
  }, [mounted, done, todayIso, krDate]);

  // Пока модель не ответила, показываем заранее собранный слой: приоритет и
  // акценты из описания преподавателя. Ответ ИИ заменяет его целиком.
  const effectivePatch = patch ?? STUDY_SEED_PATCH;

  const orderedRoadmap = useMemo(
    () => orderRoadmap(roadmap, effectivePatch.priority),
    [roadmap, effectivePatch],
  );

  const planKey = useMemo(
    () =>
      fingerprint(
        JSON.stringify({ done: Object.keys(done).sort(), krDate, todayIso, assignments: assignments.map((item) => item.id + item.status) }),
      ),
    [done, krDate, todayIso, assignments],
  );

  const runAi = useCallback(
    async (force = false) => {
      if (!plan || !user) return;
      const key = `study.ai.v2.${planKey}`;
      const failKey = `study.ai.fail.v2.${planKey}`;
      if (!force) {
        const cached = readJson<AiPlanPatch | null>(key, null);
        if (cached) {
          setPatch(cached);
          setAiState("done");
          return;
        }
        if (Number(localStorage.getItem(failKey) || 0) > Date.now() - 3_600_000) {
          setAiState("unavailable");
          return;
        }
      } else {
        try {
          localStorage.removeItem(key);
          localStorage.removeItem(failKey);
        } catch {
          /* не критично */
        }
      }

      const run = aiRun.current + 1;
      aiRun.current = run;
      setAiState("loading");
      setPatch(null);

      let parsed: AiPlanPatch | null = null;
      try {
        const sent = await aiChat([{ role: "user", content: buildAiPromptV2(plan, roadmap) }], "auto");
        if (sent.ok) parsed = parseAiPlanV2(sent.data.message.content, plan, roadmap);
      } catch {
        parsed = null;
      }
      if (aiRun.current !== run) return;
      if (!parsed || (!Object.keys(parsed.days).length && !parsed.advice.length && !parsed.priority.length)) {
        setAiState("unavailable");
        try {
          localStorage.setItem(failKey, String(Date.now()));
        } catch {
          /* не критично */
        }
        return;
      }
      setPatch(parsed);
      setAiState("done");
      writeJson(key, parsed);
    },
    [plan, planKey, roadmap, user],
  );

  // Автопересборка: отметил задачу → через секунду план уже с новыми акцентами.
  useEffect(() => {
    if (!mounted || !user || !assignmentsSettled || !plan) return;
    const timer = setTimeout(() => void runAi(), 900);
    return () => clearTimeout(timer);
  }, [mounted, user, assignmentsSettled, plan, runAi]);

  const toggleTask = useCallback((id: string) => {
    setDone((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], value: boolean) => {
    setDone((current) => {
      const next = { ...current };
      for (const id of ids) {
        if (value) next[id] = true;
        else delete next[id];
      }
      return next;
    });
  }, []);

  const setStatus = async (item: MyAssignment, status: MyAssignmentStatus) => {
    setBusyId(item.id);
    setAssignmentsError("");
    const result = await updateMyAssignment(item.id, { status });
    if (result.ok) {
      setAssignments((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status } : entry)));
    } else {
      setAssignmentsError(describeApiError(result.error));
    }
    setBusyId(null);
  };

  const syncDebts = async () => {
    setSyncBusy(true);
    setAssignmentsError("");
    const existing = new Set(assignments.map((item) => item.topic));
    const items = HISTOLOGY_PROGRAM.blocks
      .filter((block) => !existing.has(topicFor(block)))
      .map((block) => ({
        subject: "Гистология",
        topic: topicFor(block),
        due_date: block.due ?? krDate,
        status: (block.tasks.every((task) => done[task.id]) ? "passed" : "retake_needed") as MyAssignmentStatus,
        note: block.theme,
        source: "manual" as const,
      }));
    if (!items.length) {
      setSyncBusy(false);
      return;
    }
    const saved = await saveMyAssignments(items);
    if (saved.ok) {
      const refreshed = await listMyAssignments();
      if (refreshed.ok) {
        setAssignments(Array.isArray(refreshed.data?.items) ? (refreshed.data.items as MyAssignment[]) : []);
      }
    } else {
      setAssignmentsError(describeApiError(saved.error));
    }
    setSyncBusy(false);
  };

  const downloadCalendar = () => {
    if (!plan) return;
    const blob = new Blob([toIcs(plan)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plan-kr-gistologiya.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const print = (target: "em" | "plan") => {
    setPrintTarget(target);
    setTimeout(() => window.print(), 120);
  };

  const daysLeft = mounted ? daysBetween(krDate, todayIso) : 0;
  const overall = progressOf(HISTOLOGY_PROGRAM, done);
  const missingDebts = HISTOLOGY_PROGRAM.blocks.filter(
    (block) => !assignments.some((item) => item.topic === topicFor(block)),
  ).length;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Сводка" },
    { id: "plan", label: "План по дням" },
    { id: "em", label: "Электронограммы" },
    { id: "tests", label: "Тренажёр" },
  ];

  return (
    <div className="space-y-5">
      <style>{PRINT_CSS}</style>

      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-transparent dark:to-violet-500/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-600">
              <Sparkles className="h-3.5 w-3.5" /> План подготовки
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Гистология: отработки и КР</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
              Отмечай, что уже сдано. План по дням и порядок отработок пересоберутся сами; сайтовый ИИ расставит акценты.
              Сроки и темы — из текста преподавателя, без выдуманных дат.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/study#assignments" className="inline-flex items-center gap-1.5 rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4" /> Отработки
            </Link>
            <Link href="/study#plan" className="inline-flex items-center gap-1.5 rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" /> Учебный план
            </Link>
            <button
              type="button"
              onClick={() => void runAi(true)}
              disabled={!user || aiState === "loading"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {aiState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {aiState === "loading" ? "ИИ собирает…" : "Собрать с ИИ"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-full bg-white/70 px-2.5 py-1 font-semibold text-indigo-700 dark:bg-white/10 dark:text-indigo-200">
            {aiState === "done" ? "Акценты — AI, сроки — из текста" : aiState === "unavailable" ? "AI недоступен — план уже собран по описанию" : "План уже собран — акценты из описания преподавателя"}
          </span>
          <span className="text-[var(--muted)]">Отработано {overall.done} из {overall.total}</span>
          <span className="text-[var(--muted)]">КР: {krDate.split("-").reverse().join(".")}</span>
          {daysLeft > 0 ? <span className="font-semibold text-indigo-700 dark:text-indigo-200">осталось {daysLeft} дн.</span> : null}
        </div>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Разделы подготовки">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition " +
              (tab === entry.id
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-[var(--border)] bg-[var(--card)] hover:border-indigo-300")
            }
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {!mounted || !plan ? (
        <section className="card flex items-center gap-2 p-6 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Собираем план…
        </section>
      ) : tab === "overview" ? (
        <div className="space-y-4">
          <ProgramOverview
            program={HISTOLOGY_PROGRAM}
            roadmap={orderedRoadmap}
            plan={plan}
            done={done}
            krDate={krDate}
            todayIso={todayIso}
            daysLeft={daysLeft}
            patch={effectivePatch}
            aiState={aiState}
            onToggle={toggleTask}
            onToggleAll={toggleAll}
            onKrDate={setKrDate}
            onRebuild={() => void runAi(true)}
            onPrint={() => print("em")}
          />

          <section className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <ClipboardList className="h-4 w-4" /> Отработки на сайте
              </h2>
              {user && missingDebts > 0 ? (
                <button
                  type="button"
                  onClick={() => void syncDebts()}
                  disabled={syncBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {syncBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Перенести долги в трекер
                </button>
              ) : null}
            </div>
            {!user ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Войди, чтобы перенести долги в трекер отработок и включить ИИ на сайте.{" "}
                <Link href="/login" className="font-semibold text-indigo-600">Войти</Link>
              </p>
            ) : assignmentsLoading ? (
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем…</p>
            ) : assignments.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                В трекере пока пусто. Нажми «Перенести долги в трекер» — появятся 4 блока с датами и статусами.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {assignments.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.topic}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {item.subject}
                        {item.due_date ? ` · до ${item.due_date.split("-").reverse().join(".")}` : " · без срока"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {busyId === item.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      <select
                        value={item.status}
                        onChange={(event) => void setStatus(item, event.target.value as MyAssignmentStatus)}
                        disabled={busyId === item.id}
                        aria-label={`Статус: ${item.topic}`}
                        className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs font-semibold"
                      >
                        {(Object.keys(STATUS_LABEL) as MyAssignmentStatus[]).map((status) => (
                          <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {assignmentsError && <p className="mt-2 text-sm text-[var(--status-critical-fg)]">{assignmentsError}</p>}
          </section>
        </div>
      ) : tab === "plan" ? (
        <PlanDays
          plan={plan}
          patch={effectivePatch}
          done={done}
          onToggle={toggleTask}
          onPrint={() => print("plan")}
          onExport={downloadCalendar}
        />
      ) : tab === "em" ? (
        <div className="space-y-3">
          {emsError ? (
            <p className="card flex items-center gap-2 p-4 text-sm text-[var(--status-critical-fg)]">
              <TriangleAlert className="h-4 w-4" /> {emsError}
            </p>
          ) : null}
          <Electronograms ems={ems} nerve={nerveEms} onPrint={() => print("em")} />
        </div>
      ) : (
        <StudyTrainer />
      )}

      {printTarget === "em" ? <ElectronogramPrintSheet ems={ems} /> : null}
      {printTarget === "plan" && plan ? <PlanPrintSheet plan={plan} patch={effectivePatch} /> : null}

      <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <Printer className="h-3.5 w-3.5" /> Печать электронограмм идёт без интерфейса: только карточки с названиями и подписями.
      </p>
    </div>
  );
}