"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { OzizCatalog } from "@/lib/university/types";

/**
 * U7: public catalog of the ОЗиЗ Moodle. Only the public course list is shown;
 * every card links to the original Moodle page, whose contents require a login
 * performed on the Moodle side (anti-goal U9).
 */
export default function OzizCatalogSection() {
  const [catalog, setCatalog] = useState<OzizCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faculty, setFaculty] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/university/oziz${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as OzizCatalog | null;
      if (!data) throw new Error(`HTTP ${response.status}`);
      setCatalog(data);
      if (data.ok === false) setError(data.error || "Каталог ОЗиЗ временно недоступен");
      else if (data.error) setError(data.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить каталог ОЗиЗ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const faculties = useMemo(
    () => [...new Set((catalog?.courses ?? []).map((course) => course.faculty).filter((value): value is string => Boolean(value)))],
    [catalog],
  );
  const courses = useMemo(
    () => (catalog?.courses ?? []).filter((course) => !faculty || course.faculty === faculty),
    [catalog, faculty],
  );

  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BookOpen className="h-5 w-5 text-sky-600" /> Курсы ОЗиЗ в Moodle
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {catalog?.note ||
              "Публичный каталог курсов кафедры общественного здоровья и здравоохранения. Содержимое курса открывается только после входа на стороне Moodle."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Обновить
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Каталог ОЗиЗ временно недоступен</div>
            <div className="mt-1 text-xs">{error}. Ссылка на Moodle ниже продолжает работать.</div>
          </div>
        </div>
      )}

      {faculties.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFaculty(null)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${faculty === null ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Все · {catalog?.courses.length ?? 0}
          </button>
          {faculties.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFaculty(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${faculty === value ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      {loading && !catalog ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          {error ? "Список появится после восстановления источника." : "Публичных курсов сейчас нет."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {courses.map((course) => (
            <li key={course.id} className="rounded-xl border border-slate-200 p-3">
              <a
                href={course.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-1 text-sm font-semibold text-slate-900 hover:text-sky-700"
              >
                {course.title}
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              </a>
              {course.teachers.length > 0 && (
                <div className="mt-1 text-xs text-slate-500">{course.teachers.join(", ")}</div>
              )}
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-medium text-slate-500">
                {course.faculty && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{course.faculty}</span>}
                {course.program && <span className="rounded-full bg-slate-100 px-2 py-0.5">{course.program}</span>}
                {course.course && <span className="rounded-full bg-slate-100 px-2 py-0.5">{course.course}</span>}
                {course.form && <span className="rounded-full bg-slate-100 px-2 py-0.5">{course.form}</span>}
                {course.year && <span className="rounded-full bg-slate-100 px-2 py-0.5">{course.year}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        {catalog?.stale ? "Источник не ответил — показан последний удачный каталог. " : ""}
        Материалы курса доступны только после входа в Moodle; расширение Bridge работает на уже открытой вами сессии.
      </p>
    </section>
  );
}
