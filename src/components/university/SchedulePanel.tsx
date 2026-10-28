"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import type { Faculty, FacultyScheduleResponse, FacultyScheduleSummary, ScheduleItem } from "./types";
import { FESMU_SOURCE, formatDateTime } from "./format";
import SaveButton from "./SaveButton";

type Props = {
  faculties?: Faculty[];
  /** Server-side «what is inside» per faculty, so the card is informative before a click (U5). */
  summaries?: FacultyScheduleSummary[];
  indexUrl?: string;
  documents?: ScheduleItem[];
  note?: string;
  documentsFetchedAt?: string | null;
  documentsCached?: boolean;
  documentsStale?: boolean;
  documentsError?: string | null;
  onRetryDocuments: () => void;
};

const KIND_ORDER = [
  "lectures",
  "classes",
  "exams",
  "practice-exams",
  "credits",
  "debt",
  "gia",
  "diploma",
  "process-graph",
  "other",
];

const FALLBACK_INDEX_URL = "https://www.fesmu.ru/ucheba/raspisanie/";

function courseRank(item: ScheduleItem): number {
  if (typeof item.course_number === "number" && Number.isFinite(item.course_number)) return item.course_number;
  const match = `${item.course || ""} ${item.title}`.match(/(\d+)\s*(?:-?й)?\s*курс/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function kindRank(kind?: string): number {
  const index = KIND_ORDER.indexOf(kind || "");
  return index < 0 ? KIND_ORDER.length : index;
}

function schedulePayload(item: ScheduleItem) {
  return [
    {
      title: item.title,
      url: item.url,
      kind: "document" as const,
      source: FESMU_SOURCE,
      summary:
        [item.program, item.course, item.form, item.semester, item.kind_label || item.kind, item.format]
          .filter(Boolean)
          .join(" · ") || undefined,
    },
  ];
}

function pluralFiles(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} файл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} файла`;
  return `${count} файлов`;
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition hover:border-indigo-200 hover:bg-white">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
        <FileText className="h-4 w-4" />
      </span>
      <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800 group-hover:text-indigo-700">{item.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
          <span className="font-medium text-indigo-600">{item.kind_label || item.kind || "документ"}</span>
          {item.semester && <span>{item.semester}</span>}
          {item.stream && <span>{item.stream}</span>}
          {item.form && <span>{item.form}</span>}
          {item.format && <span className="uppercase">{item.format}</span>}
          {item.program && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{item.program}</span>}
          {item.context && <span>{item.context}</span>}
          {item.course && <span>{item.course}</span>}
          {item.is_debt && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">задолженность</span>}
        </span>
      </a>
      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500" />
      <SaveButton payload={schedulePayload(item)} />
    </div>
  );
}

/** Расписание: 6 факультетов, общие документы, поиск, «Повторить» на каждый раздел. */
export default function SchedulePanel({
  faculties,
  summaries,
  indexUrl,
  documents,
  note,
  documentsFetchedAt,
  documentsCached,
  documentsStale,
  documentsError,
  onRetryDocuments,
}: Props) {
  const list = useMemo(() => (Array.isArray(faculties) ? faculties : []), [faculties]);
  const summaryById = useMemo(() => {
    const map = new Map<string, FacultyScheduleSummary>();
    for (const summary of Array.isArray(summaries) ? summaries : []) {
      if (summary && typeof summary.id === "string") map.set(summary.id, summary);
    }
    return map;
  }, [summaries]);
  const docs = useMemo(() => (Array.isArray(documents) ? documents : []), [documents]);
  const [selected, setSelected] = useState("");
  const [schedules, setSchedules] = useState<Record<string, FacultyScheduleResponse>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const sourceUrl = indexUrl || FALLBACK_INDEX_URL;

  useEffect(() => {
    if (list.length === 0) return;
    setSelected((previous) => (previous && list.some((faculty) => faculty.id === previous) ? previous : list[0].id));
  }, [list]);

  const loaded = useRef<Set<string>>(new Set());

  const loadFaculty = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/university?faculty=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as FacultyScheduleResponse | null;
      if (!data) throw new Error(`HTTP ${response.status}`);
      if (data.ok === false || (!response.ok && !Array.isArray(data.items))) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      loaded.current.add(id);
      setSchedules((previous) => ({ ...previous, [id]: data }));
    } catch (cause) {
      loaded.current.delete(id);
      setSchedules((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setError(cause instanceof Error ? cause.message : "Расписание факультета временно недоступно");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected || loaded.current.has(selected)) return;
    void loadFaculty(selected);
  }, [selected, loadFaculty]);

  const current = selected ? schedules[selected] : undefined;
  const items = useMemo(() => (Array.isArray(current?.items) ? current.items : []), [current]);

  // U1/U4: сначала специальность, потом курс — иначе файлы фармацевтов и
  // медиков-биохимиков лежат в одной куче на одной и той же странице.
  const fallbackProgram = useMemo(() => {
    const programs = current?.faculty?.programs;
    return Array.isArray(programs) && programs.length === 1 ? programs[0] : "Без специальности";
  }, [current]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!needle) return true;
      return `${item.title} ${item.program || ""} ${item.form || ""} ${item.course || ""} ${item.semester || ""} ${item.stream || ""} ${item.kind_label || item.kind || ""}`
        .toLowerCase()
        .includes(needle);
    });
    const programs = new Map<string, Map<string, ScheduleItem[]>>();
    for (const item of filtered) {
      const programKey = item.program || fallbackProgram;
      const courseKey = item.course || "Общие материалы";
      const courses = programs.get(programKey) || new Map<string, ScheduleItem[]>();
      const bucket = courses.get(courseKey) || [];
      bucket.push(item);
      courses.set(courseKey, bucket);
      programs.set(programKey, courses);
    }
    return [...programs.entries()]
      .map(([program, courses]) => ({
        program,
        fileCount: [...courses.values()].reduce((total, bucket) => total + bucket.length, 0),
        courses: [...courses.entries()]
          .map(([course, bucket]) => ({
            course,
            items: [...bucket].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.title.localeCompare(b.title, "ru")),
          }))
          .sort((a, b) => {
            const ra = courseRank(a.items[0]);
            const rb = courseRank(b.items[0]);
            if (ra === rb) return a.course.localeCompare(b.course, "ru");
            return ra - rb;
          }),
      }))
      .sort((a, b) => a.program.localeCompare(b.program, "ru"));
  }, [items, query, fallbackProgram]);

  return (
    <section id="schedule" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarDays className="h-5 w-5 text-indigo-600" /> Расписание факультетов
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {note || "Официальные PDF. MEDBIOHIM не изменяет файлы вуза и не подставляет расписание из других источников."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Первоисточник <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {current && (
            <button
              type="button"
              onClick={() => void loadFaculty(selected)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Обновить
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          <span>
            Список факультетов пока не получен.{" "}
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600">
              Открыть расписание на сайте ДВГМУ
            </a>
          </span>
          <button
            type="button"
            onClick={onRetryDocuments}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Повторить
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((faculty) => {
              const summary = summaryById.get(faculty.id);
              const programs = summary?.programs?.length ? summary.programs : faculty.programs || [];
              return (
                <button
                  key={faculty.id}
                  type="button"
                  onClick={() => setSelected(faculty.id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    selected === faculty.id
                      ? "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-semibold">{faculty.title}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {[faculty.code, faculty.program].filter(Boolean).join(" · ") || "Официальная страница"}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-semibold">
                    {summary?.ok && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {pluralFiles(summary.doc_count || 0)}
                      </span>
                    )}
                    {summary?.ok && Boolean(summary.courses?.length) && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {summary.courses?.length} курс(а/ов)
                      </span>
                    )}
                    {summary?.ok && summary.has_streams && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">потоки</span>
                    )}
                    {summary?.ok && summary.has_forms && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">формы обучения</span>
                    )}
                    {summary && summary.ok === false && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">состав уточняется</span>
                    )}
                  </span>
                  {programs.length > 0 && (
                    <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                      {programs.slice(0, 3).join(" · ")}
                      {programs.length > 3 ? ` · ещё ${programs.length - 3}` : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти файл: экзамен, 3 курс, лекции..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-300"
              />
            </div>
            <div className="text-xs text-slate-400">
              {current ? `${items.length} файлов · получено ${formatDateTime(current.fetched_at)}` : "Загрузка..."}
              {current?.cached && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5">кэш 30 мин</span>}
              {current?.stale && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">устаревшие данные</span>}
            </div>
          </div>

          {loading && !current ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Читаем официальную страницу факультета...
            </div>
          ) : (error && !current) || current?.error ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error || current?.error}</span>
              <a href={current?.faculty?.url || sourceUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
                Открыть первоисточник
              </a>
              <button
                type="button"
                onClick={() => void loadFaculty(selected)}
                disabled={loading}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Повторить
              </button>
            </div>
          ) : grouped.length === 0 ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
              {query ? "По этому запросу файлов нет." : "На странице факультета пока нет PDF-файлов."}
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {grouped.map((program) => (
                <div key={program.program}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                      {program.program}
                    </span>
                    <span className="text-[11px] text-slate-400">{pluralFiles(program.fileCount)}</span>
                  </div>
                  <div className="space-y-3">
                    {program.courses.map((course) => (
                      <div key={`${program.program}|${course.course}`}>
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                            {course.course}
                          </span>
                          <span className="text-[11px] text-slate-400">{course.items.length}</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {course.items.map((item) => (
                            <ScheduleRow key={item.url} item={item} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FolderOpen className="h-4 w-4 text-slate-500" /> Общие документы и графики
          </h3>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {documentsFetchedAt && <span>получено {formatDateTime(documentsFetchedAt)}</span>}
            {documentsCached && <span className="rounded-full bg-slate-100 px-2 py-0.5">кэш 30 мин</span>}
            {documentsStale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">устаревшие данные</span>}
          </div>
        </div>
        {documentsError ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{documentsError}</span>
            <button type="button" onClick={onRetryDocuments} className="ml-auto rounded-lg bg-white px-2.5 py-1 font-semibold text-amber-800">
              Повторить
            </button>
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
              Первоисточник
            </a>
          </div>
        ) : docs.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-xs text-slate-500">
            Общие графики пока не получены.{" "}
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600">
              Открыть страницу расписания
            </a>
          </p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {docs.map((item) => (
              <ScheduleRow key={item.url} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
