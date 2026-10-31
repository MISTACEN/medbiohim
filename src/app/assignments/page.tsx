"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Loader2, Plus, Trash2, Upload } from "lucide-react";
import {
  deleteMyAssignment,
  hasToken,
  listMyAssignments,
  saveMyAssignments,
  updateMyAssignment,
  type MyAssignment,
  type MyAssignmentStatus,
} from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { describeApiError } from "@/lib/errors";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Личный трекер отработок. Это «мои» данные, а не ведомость: сервер хранит
 * только строки самого студента (RLS owner-only), чужие оценки не собираются.
 * Источники записи: ручной ввод и CSV-строка из журнала, вырезанная студентом.
 */

type Filter = "all" | MyAssignmentStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "pending", label: "Ожидают" },
  { id: "retake_needed", label: "Отработка" },
  { id: "passed", label: "Сдано" },
  { id: "failed", label: "Не сдано" },
];

const STATUSES: { id: MyAssignmentStatus; label: string; badge: string }[] = [
  { id: "pending", label: "Ожидает", badge: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" },
  { id: "retake_needed", label: "Отработка", badge: "bg-indigo-50 text-indigo-700" },
  { id: "passed", label: "Сдано", badge: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" },
  { id: "failed", label: "Не сдано", badge: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]" },
];

function statusMeta(status: string) {
  return STATUSES.find((entry) => entry.id === status) || STATUSES[0];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(value?: string | null): string {
  if (!value) return "без срока";
  return value.slice(0, 10).split("-").reverse().join(".");
}

function isOverdue(item: MyAssignment): boolean {
  if (!item.due_date) return false;
  if (item.status === "passed") return false;
  return item.due_date < todayIso();
}

/** `дд.мм.гггг` → `гггг-мм-дд`; всё остальное оставляем как есть, если это уже ISO. */
function normalizeDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const ru = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(raw);
  if (ru) {
    const [, d, m, y] = ru;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

const STATUS_WORDS: Record<string, MyAssignmentStatus> = {
  сдано: "passed",
  сдал: "passed",
  зачтено: "passed",
  passed: "passed",
  "не сдано": "failed",
  несдано: "failed",
  неуд: "failed",
  failed: "failed",
  отработка: "retake_needed",
  отработать: "retake_needed",
  "на отработку": "retake_needed",
  retake: "retake_needed",
  ожидает: "pending",
  pending: "pending",
  "": "pending",
};

type ParsedRow = {
  subject: string;
  topic: string;
  due_date: string | null;
  status: MyAssignmentStatus;
  grade: string | null;
};

/**
 * Разбор CSV/TSV на клиенте: на сервер уходит уже только строка самого
 * студента. Разделитель определяется по первой строке (`;`, `,` или таб),
 * заголовок пропускается, если первая ячейка похожа на «предмет».
 */
function parseCsv(input: string): { rows: ParsedRow[]; error?: string } {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], error: "В файле нет строк." };
  const delimiter = [";", "\t", ","].reduce((best, candidate) => {
    const count = lines[0].split(candidate).length;
    return count > lines[0].split(best).length ? candidate : best;
  }, ";");
  const rows: ParsedRow[] = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (index === 0 && /предмет|subject|дисциплин/i.test(cells[0] || "")) continue;
    const subject = cells[0] || "";
    const topic = cells[1] || "";
    if (!subject || !topic) continue;
    const due = normalizeDate(cells[2] || "");
    const status = STATUS_WORDS[(cells[3] || "").toLowerCase()] || "pending";
    rows.push({ subject, topic, due_date: due, status, grade: cells[4] || null });
  }
  if (!rows.length) return { rows: [], error: "Не нашлось ни одной строки вида «предмет; тема; дата; статус»." };
  return { rows };
}

export default function AssignmentsPage() {
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [items, setItems] = useState<MyAssignment[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<MyAssignmentStatus>("pending");
  const [grade, setGrade] = useState("");
  const [saving, setSaving] = useState(false);
  const [csvPreview, setCsvPreview] = useState<ParsedRow[] | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listMyAssignments();
    if (result.ok) {
      setItems(Array.isArray(result.data?.items) ? (result.data.items as MyAssignment[]) : []);
    } else {
      setError({ message: describeApiError(result.error), requestId: (result.error as { requestId?: string })?.requestId });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || !hasToken()) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, load]);

  const addEntry = async () => {
    if (!subject.trim() || !topic.trim()) {
      setActionError("Заполните предмет и тему.");
      return;
    }
    setSaving(true);
    setActionError("");
    const result = await saveMyAssignments([
      {
        subject: subject.trim(),
        topic: topic.trim(),
        due_date: dueDate || null,
        status,
        grade: grade.trim() || null,
      },
    ]);
    if (result.ok) {
      setSubject("");
      setTopic("");
      setDueDate("");
      setGrade("");
      setStatus("pending");
      setNotice("Запись добавлена.");
      await load();
    } else {
      setActionError(describeApiError(result.error));
    }
    setSaving(false);
  };

  const patch = async (
    item: MyAssignment,
    values: { status?: MyAssignmentStatus; grade?: string | null; note?: string | null; due_date?: string | null },
  ) => {
    setBusyId(item.id);
    setActionError("");
    const result = await updateMyAssignment(item.id, values);
    if (result.ok) {
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...values } : row)));
    } else {
      setActionError(describeApiError(result.error));
    }
    setBusyId(null);
  };

  const remove = async (item: MyAssignment) => {
    setBusyId(item.id);
    setActionError("");
    const result = await deleteMyAssignment(item.id);
    if (result.ok) {
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setNotice("Запись удалена.");
    } else {
      setActionError(describeApiError(result.error));
    }
    setBusyId(null);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setActionError("");
    setNotice("");
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.error) {
        setCsvPreview(null);
        setActionError(parsed.error);
        return;
      }
      setCsvPreview(parsed.rows);
    } catch (readError) {
      setCsvPreview(null);
      setActionError(`Не удалось прочитать файл: ${readError instanceof Error ? readError.message : String(readError)}`);
    }
  };

  const importCsv = async () => {
    if (!csvPreview?.length) return;
    setCsvBusy(true);
    setActionError("");
    const result = await saveMyAssignments(csvPreview.map((row) => ({ ...row, source: "csv" as const })));
    if (result.ok) {
      setNotice(`Импортировано строк: ${result.data?.saved ?? csvPreview.length}.`);
      setCsvPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } else {
      setActionError(describeApiError(result.error));
    }
    setCsvBusy(false);
  };

  const counts = useMemo(() => {
    const base: Record<Filter, number> = { all: items.length, pending: 0, retake_needed: 0, passed: 0, failed: 0 };
    for (const item of items) {
      base[item.status] += 1;
    }
    return base;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [items, filter],
  );

  if (authLoading) return <SkeletonCards count={3} />;

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10" style={{ color: "var(--muted)" }} />
        <h1 className="mt-3 text-xl font-bold">Отработки</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Войдите, чтобы вести личный список долгов и отработок — он виден только вам.
        </p>
        <Link href="/login" className="btn-primary mt-4 inline-block">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Отработки</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Личный список долгов: что сдано, что ждёт и когда дедлайн. Виден только вам.
          </p>
        </div>
        <Link href="/homework" className="text-sm font-semibold text-indigo-600 hover:underline">
          Задания группы →
        </Link>
      </header>

      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { label: "Всего", value: counts.all, tone: "text-slate-700" },
          { label: "Ожидают", value: counts.pending, tone: "text-[var(--status-warn-fg)]" },
          { label: "На отработку", value: counts.retake_needed, tone: "text-indigo-700" },
          { label: "Сдано", value: counts.passed, tone: "text-[var(--status-ok-fg)]" },
        ].map((card) => (
          <div key={card.label} className="card px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{card.label}</div>
            <div className={`mt-1 text-2xl font-extrabold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Добавить запись</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Предмет"
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Тема / занятие"
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-indigo-400"
            aria-label="Срок"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as MyAssignmentStatus)}
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-indigo-400"
            aria-label="Статус"
          >
            {STATUSES.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              placeholder="Оценка"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={() => void addEntry()}
              disabled={saving}
              className="btn-primary inline-flex shrink-0 items-center gap-1.5 text-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Добавить
            </button>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">Импорт из журнала (CSV)</h2>
          <Link href="/journal" className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
            Фото журнала → только моя строка
          </Link>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Выгрузите строку с собой из журнала или сделайте CSV вручную: <code>предмет; тема; дд.мм.гггг; статус; оценка</code>.
          Вырежьте чужие строки до загрузки — сервер принимает только ваши.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/plain"
            onChange={(event) => void onFile(event.target.files?.[0])}
            className="text-sm"
          />
          {csvPreview && (
            <>
              <span className="text-xs text-[var(--muted)]">Разобрано строк: {csvPreview.length}</span>
              <button
                type="button"
                onClick={() => void importCsv()}
                disabled={csvBusy}
                className="btn-primary inline-flex items-center gap-1.5 text-sm"
              >
                {csvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Импортировать
              </button>
              <button
                type="button"
                onClick={() => {
                  setCsvPreview(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-xl border px-3 py-1.5 text-sm font-semibold"
              >
                Отменить
              </button>
            </>
          )}
        </div>
        {csvPreview && (
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
            {csvPreview.slice(0, 5).map((row, index) => (
              <li key={`${row.subject}-${row.topic}-${index}`}>
                {row.subject} · {row.topic} · {fmtDate(row.due_date)} · {statusMeta(row.status).label}
                {row.grade ? ` · ${row.grade}` : ""}
              </li>
            ))}
            {csvPreview.length > 5 && <li>…и ещё {csvPreview.length - 5}</li>}
          </ul>
        )}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Фильтры отработок">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
              (filter === id
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] hover:border-indigo-300")
            }
          >
            {label}
            <span className={"ml-1.5 text-xs " + (filter === id ? "text-white/80" : "text-[var(--muted)]")}>
              {counts[id]}
            </span>
          </button>
        ))}
      </nav>

      {error && <ErrorState message={error.message} requestId={error.requestId} retry={() => void load()} />}

      {loading ? (
        <SkeletonCards count={3} />
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--status-ok-fg)]" />
          <p className="mt-3 font-semibold">
            {filter === "all" ? "Записей пока нет" : "В этом статусе пусто"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Добавьте отработку вручную или импортируйте строку из журнала — данные увидите только вы.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const meta = statusMeta(item.status);
            const overdue = isOverdue(item);
            const open = openId === item.id;
            return (
              <li key={item.id} className="card overflow-hidden">
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    aria-expanded={open}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{item.topic}</span>
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + meta.badge}>{meta.label}</span>
                      {overdue && (
                        <span className="rounded-full bg-[var(--status-critical-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-critical-fg)]">Просрочено</span>
                      )}
                      {item.grade && <span className="text-xs font-semibold text-indigo-600">Оценка: {item.grade}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                      <span>{item.subject}</span>
                      <span className={"inline-flex items-center gap-1 " + (overdue ? "font-semibold text-[var(--status-critical-fg)]" : "")}>
                        <CalendarDays className="h-3.5 w-3.5" /> {fmtDate(item.due_date)}
                      </span>
                      <span>{item.source === "csv" ? "из CSV" : "вручную"}</span>
                    </div>
                  </button>
                  <select
                    value={item.status}
                    onChange={(event) => void patch(item, { status: event.target.value as MyAssignmentStatus })}
                    disabled={busyId === item.id}
                    aria-label={`Статус: ${item.topic}`}
                    className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs font-semibold outline-none"
                  >
                    {STATUSES.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    className="rounded-xl p-1.5"
                    aria-label="Подробности"
                  >
                    <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
                  </button>
                </div>

                {open && (
                  <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs font-semibold text-[var(--muted)]">
                        Оценка
                        <input
                          defaultValue={item.grade || ""}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value !== (item.grade || "")) void patch(item, { grade: value || null });
                          }}
                          className="mt-1 block w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-semibold text-[var(--muted)]">
                        Срок
                        <input
                          type="date"
                          defaultValue={item.due_date || ""}
                          onBlur={(event) => {
                            const value = event.target.value || null;
                            if (value !== (item.due_date || null)) void patch(item, { due_date: value });
                          }}
                          className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="min-w-[220px] flex-1 text-xs font-semibold text-[var(--muted)]">
                        Заметка
                        <textarea
                          defaultValue={item.note || ""}
                          rows={2}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value !== (item.note || "")) void patch(item, { note: value || null });
                          }}
                          className="mt-1 block w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void remove(item)}
                        disabled={busyId === item.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--status-critical-border)] px-3 py-2 text-sm font-semibold text-[var(--status-critical-fg)] disabled:opacity-40"
                      >
                        {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notice && (
        <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]" role="status">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]" role="alert">
          {actionError}
        </div>
      )}
    </div>
  );
}
