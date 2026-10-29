"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ClipboardCheck,
  FlaskConical,
  History,
  ListChecks,
  Loader2,
  Search,
} from "lucide-react";
import {
  getChemistryMaster,
  hasToken,
  listMyAttempts,
} from "@/lib/api";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import { ErrorState } from "@/components/ui/ErrorState";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import TestsHub from "@/components/tests/TestsHub";

type View = "tests" | "chemistry" | "history";

/** Серверный статус попытки — студенту нужен русский текст, а не сырой enum. */
const ATTEMPT_STATUS: Record<string, string> = {
  completed: "завершён",
  finished: "завершён",
  graded: "проверен",
  active: "идёт",
  in_progress: "идёт",
  started: "идёт",
  pending: "ожидает проверки",
  expired: "время истекло",
  abandoned: "прерван",
  cancelled: "отменён",
};

function attemptStatusText(status: unknown): string {
  const key = String(status || "").trim().toLowerCase();
  return ATTEMPT_STATUS[key] || "—";
}

const VIEWS: Array<{ id: View; label: string; Icon: typeof ClipboardCheck }> = [
  { id: "tests", label: "Тесты и банки", Icon: ClipboardCheck },
  { id: "chemistry", label: "Химия", Icon: FlaskConical },
  { id: "history", label: "История попыток", Icon: History },
];

function TestsPageInner() {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState<View>("tests");
  const [chemistryPage, setChemistryPage] = useState(1);
  const [chemistryQuery, setChemistryQuery] = useState("");
  const [chemistryKind, setChemistryKind] = useState("");
  const [chemistryFormula, setChemistryFormula] = useState("");

  useEffect(() => {
    if (requestedView === "chemistry" || requestedView === "history" || requestedView === "tests") setView(requestedView);
  }, [requestedView]);

  function selectView(next: View) {
    setView(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "tests") url.searchParams.delete("view");
      else url.searchParams.set("view", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  // D9: история попыток через useApiRequest — ручные cancelled-флаги и
  // дублирующая ручная загрузка заменены на reload() хука.
  const {
    data: attemptsLoad,
    loading: attemptsLoading,
    error: attemptsLoadError,
    reload: reloadAttempts,
  } = useApiRequest(
    async (signal) => {
      if (authLoading || !hasToken()) return null;
      const result = await listMyAttempts(undefined, user?.groupId, { signal });
      if (!result.ok) throw new Error(describeApiError(result.error));
      return Array.isArray(result.data?.items) ? result.data.items : [];
    },
    [authLoading, user?.groupId]
  );
  const attempts = attemptsLoad ?? [];
  const attemptsError = attemptsLoadError ?? "";

  // D9: банк по химии — тот же хук; пауза 250 мс до запроса сохранена,
  // отмена при смене запроса/страницы выполняется через AbortSignal.
  const { data: chemLoad, loading: chemistryLoading, error: chemistryLoadError } = useApiRequest(
    async (signal) => {
      if (authLoading || !hasToken() || view !== "chemistry") return null;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const result = await getChemistryMaster(
        {
          q: chemistryQuery,
          kind: chemistryKind,
          formula: chemistryFormula,
          page: chemistryPage,
          limit: 12,
        },
        { signal },
      );
      if (!result.ok) throw new Error(result.error?.message || "Не удалось загрузить банк по химии.");
      return result.data;
    },
    [authLoading, view, chemistryQuery, chemistryKind, chemistryFormula, chemistryPage]
  );
  const chemistryItems = chemLoad?.items ?? [];
  const chemistryTotal = Number(chemLoad?.pagination?.total || 0);
  const chemistryPages = Math.max(1, Number(chemLoad?.pagination?.pages || 1));
  const chemistryError = chemistryLoadError ?? "";

  if (authLoading) {
    return (
      <div className="card flex items-center gap-3 p-8 text-sm text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Загрузка…
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-[var(--muted)]">Войдите, чтобы проходить тесты и открывать банки вопросов.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <nav className="mobile-scroll-x flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap" aria-label="Разделы тестов">
        {VIEWS.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectView(id)}
              aria-current={active ? "page" : undefined}
              className={
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (active
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              {id === "chemistry" && chemistryTotal > 0 && (
                <span className={"rounded-full px-2 py-0.5 text-xs " + (active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                  {chemistryTotal}
                </span>
              )}
              {id === "history" && attempts.length > 0 && (
                <span className={"rounded-full px-2 py-0.5 text-xs " + (active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                  {attempts.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {view === "tests" && <TestsHub />}

      {view === "chemistry" && (
        <section className="space-y-4">
          <header className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <FlaskConical className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Отдельный банк</p>
                  <h2 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">Задания по химии</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    Открытые задания и тестовые вопросы из методических источников. Формулы и эталоны не подменяются догадками.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  {chemistryTotal} найдено
                </span>
                {/* H6: банк из методичек дополняется процедурными задачами —
                    из того же раздела можно собрать вариант по seed. */}
                <Link
                  href="/chemistry/practice"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <ListChecks className="h-3.5 w-3.5" /> Генератор вариантов
                </Link>
              </div>
            </div>
          </header>

          <div className="card space-y-4 p-4 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={chemistryQuery}
                  onChange={(event) => { setChemistryQuery(event.target.value); setChemistryPage(1); }}
                  placeholder="Поиск по вопросу или теме…"
                  className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <select
                value={chemistryKind}
                onChange={(event) => { setChemistryKind(event.target.value); setChemistryPage(1); }}
                className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              >
                <option value="">Все типы</option>
                <option value="open_task">Открытые задания</option>
                <option value="test_question">Тестовые вопросы</option>
              </select>
              <select
                value={chemistryFormula}
                onChange={(event) => { setChemistryFormula(event.target.value); setChemistryPage(1); }}
                className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              >
                <option value="">Формулы: все</option>
                <option value="true">Формулы сохранены</option>
                <option value="false">Без формулы</option>
              </select>
            </div>

            {chemistryError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{chemistryError}</div>
            )}

            {chemistryLoading ? (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-5 text-sm text-[var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Загружаю задания…
              </div>
            ) : chemistryItems.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-5 text-sm text-[var(--muted)]">По заданным фильтрам ничего не найдено.</div>
            ) : (
              <div className="space-y-2">
                {chemistryItems.map((item: any, index: number) => (
                  <details key={String(item.item_id)} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
                    <summary className="cursor-pointer list-none px-3 py-3 sm:px-4">
                      <div className="flex gap-3">
                        <span className="min-w-7 text-xs font-semibold text-slate-400">{(chemistryPage - 1) * 12 + index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-800">{String(item.question || "Без текста")}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                            <span>{item.kind === "test_question" ? "Тест" : "Задание"}</span>
                            {item.topic && <span>· {String(item.topic)}</span>}
                            {item.formula_preserved && <span className="font-medium text-indigo-600">· формула сохранена</span>}
                            {item.answer_status === "prepared_from_text" && <span className="font-medium text-emerald-600">· ответ подготовлен</span>}
                          </div>
                        </div>
                      </div>
                    </summary>
                    <div className="border-t border-[var(--border)] bg-slate-50/60 px-3 py-3 sm:px-5">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ответ</div>
                      {item.answer ? (
                        <ChemRichText text={String(item.answer)} className="mt-2 space-y-2 text-sm text-slate-700" />
                      ) : (
                        <p className="mt-2 text-sm text-amber-700">Ответ ещё не подготовлен. Исходная формулировка сохранена.</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                        {item.source && <span className="rounded-full border bg-white px-2 py-1">Источник: {String(item.source)}</span>}
                        {item.source_number && <span className="rounded-full border bg-white px-2 py-1">№ {String(item.source_number)}</span>}
                        {item.answer_status && <span className="rounded-full border bg-white px-2 py-1">{String(item.answer_status)}</span>}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
              <button
                type="button"
                disabled={chemistryPage <= 1 || chemistryLoading}
                onClick={() => setChemistryPage((page) => Math.max(1, page - 1))}
                className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                ← Назад
              </button>
              <span className="text-xs text-[var(--muted)]">Страница {chemistryPage} из {chemistryPages}</span>
              <button
                type="button"
                disabled={chemistryPage >= chemistryPages || chemistryLoading}
                onClick={() => setChemistryPage((page) => Math.min(chemistryPages, page + 1))}
                className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Вперёд →
              </button>
            </div>
          </div>
        </section>
      )}

      {view === "history" && (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">История попыток</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Последние завершённые и незавершённые попытки по всем предметам.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{attempts.length}</span>
          </div>

          {attemptsError && (
            <div className="mt-4">
              <ErrorState
                compact
                title="История попыток не загрузилась"
                message={attemptsError}
                retry={() => reloadAttempts()}
              />
            </div>
          )}

          {attemptsLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаю историю…
            </div>
          ) : attempts.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-[var(--muted)]">Попыток пока нет. Начните с любого банка во вкладке «Тесты и банки».</p>
          ) : (
            <div className="mt-4 space-y-2">
              {attempts.map((attempt: any) => (
                <div key={String(attempt.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-slate-50 px-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">{String(attempt.test_title || "Тест")}</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {attempt.started_at ? String(attempt.started_at).slice(0, 16).replace("T", " ") : "—"} · {attemptStatusText(attempt.status)}
                    </div>
                  </div>
                  <div className="font-bold text-indigo-700">
                    {attempt.percent != null ? `${Math.round(Number(attempt.percent))}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function TestsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка…</div>}>
      <TestsPageInner />
    </Suspense>
  );
}
