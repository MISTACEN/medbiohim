"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminDbAudit, adminDbAuditVersion, adminRollbackAudit, hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";

type AuditRow = {
  id: string;
  table_name: string;
  row_key?: { id?: string } | string | null;
  version_no?: number;
  source?: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  created_at?: string;
};

type AuditDetail = {
  version: { table_name: string; row_id: string | null; version_no?: number; source?: string; created_at?: string };
  fields: string[];
  snapshot: Record<string, unknown>;
  current: Record<string, unknown> | null;
  row_missing: boolean;
  rollback_supported: boolean;
  truncated?: boolean;
};

const TABLE_LABEL: Record<string, string> = {
  questions: "Вопрос",
  tests: "Тест",
  materials: "Материал",
};

const SOURCE_LABEL: Record<string, string> = {
  admin_ui: "правка в админке",
  admin_archive: "архивирование",
  admin_move: "перемещение",
  admin_rollback: "откат",
};

const PAGE_SIZE = 50;

function rowId(row: AuditRow): string {
  const key = row.row_key;
  if (key && typeof key === "object") return String(key.id || "");
  if (typeof key === "string") {
    try {
      return String(JSON.parse(key)?.id || "");
    } catch {
      return "";
    }
  }
  return "";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "string") {
    const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 180 ? `${text.slice(0, 180)}…` : text || "—";
  }
  if (Array.isArray(value)) return value.length ? value.map((item) => formatValue(item)).join(", ") : "[]";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 180);
  return String(value);
}

function formatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Журнал версий контента: что менялось, чем отличается от текущего и откат. */
export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [table, setTable] = useState("");
  const [rollbackTables, setRollbackTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [details, setDetails] = useState<Record<string, AuditDetail | null>>({});
  const [busy, setBusy] = useState("");
  const { confirm, dialog } = useConfirm();

  function msg(err = "", good = "") { setError(err); setOk(good); }

  const load = useCallback(async (nextTable: string, nextOffset: number) => {
    setLoading(true);
    const r = await adminDbAudit({ limit: PAGE_SIZE, offset: nextOffset, table: nextTable || undefined });
    setLoading(false);
    if (!r.ok) return msg(describeApiError(r.error));
    setRows((r.data.items || []) as AuditRow[]);
    setTotal(Number(r.data.total ?? (r.data.items || []).length));
    setOffset(nextOffset);
    setRollbackTables(Array.isArray(r.data.rollback_tables) ? r.data.rollback_tables : []);
    setDetails({});
  }, []);

  useEffect(() => { void load("", 0); }, [load]);

  async function openDetail(row: AuditRow) {
    if (details[row.id]) {
      setDetails((prev) => ({ ...prev, [row.id]: null }));
      return;
    }
    setBusy("detail-" + row.id);
    const r = await adminDbAuditVersion(row.id);
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    setDetails((prev) => ({ ...prev, [row.id]: r.data as AuditDetail }));
  }

  async function rollback(row: AuditRow) {
    const label = TABLE_LABEL[row.table_name] || row.table_name;
    const agreed = await confirm({
      title: `Откатить к версии №${row.version_no}?`,
      description: `${label} вернётся к значениям этой версии. Текущее состояние тоже попадёт в журнал, так что откат обратим.`,
      confirmLabel: "Откатить",
    });
    if (!agreed) return;
    setBusy("rollback-" + row.id);
    const r = await adminRollbackAudit(row.id);
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", `Версия №${row.version_no} восстановлена`);
    await load(table, offset);
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Аудит изменений</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const hasPrev = offset > 0;
  const hasNext = offset + rows.length < total;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Аудит изменений</h1>
          <p className="page-subtitle">
            История версий вопросов, тестов и материалов: кто менял, что изменилось и откат в один шаг.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={table}
            onChange={(e) => { setTable(e.target.value); void load(e.target.value, 0); }}
            aria-label="Фильтр по типу контента"
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="">Все типы</option>
            {Object.entries(TABLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => void load(table, offset)}>
            {loading ? "Обновляем…" : "Обновить"}
          </button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {ok && <div className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]">{ok}</div>}

      {rows.length === 0 && !loading && (
        <div className="card text-sm text-slate-500">
          Записей нет. Журнал наполняется, когда контент правят через админку, архивируют или перемещают.
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Когда</th>
                <th className="px-3 py-2 font-semibold">Объект</th>
                <th className="px-3 py-2 font-semibold">Версия</th>
                <th className="px-3 py-2 font-semibold">Кто и как</th>
                <th className="px-3 py-2 font-semibold text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const detail = details[row.id];
                const supported = rollbackTables.includes(row.table_name);
                return (
                  <Fragment key={row.id}>
                    <tr className="border-b last:border-0 align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatTime(row.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{TABLE_LABEL[row.table_name] || row.table_name}</div>
                        <div className="text-xs text-slate-500">{rowId(row) || "—"}</div>
                      </td>
                      <td className="px-3 py-2">№{row.version_no ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div>{row.actor_name || "неизвестно"}</div>
                        <div className="text-xs text-slate-500">{SOURCE_LABEL[String(row.source)] || row.source || "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            disabled={busy === "detail-" + row.id}
                            onClick={() => void openDetail(row)}
                          >
                            {detail ? "Скрыть" : "Что изменилось"}
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-[var(--status-critical-border)] px-3 py-2 text-xs font-semibold text-[var(--status-critical-fg)] transition hover:bg-[var(--status-critical-bg)] disabled:opacity-40"
                            disabled={!supported || busy === "rollback-" + row.id}
                            title={supported ? "Вернуть значения этой версии" : "Откат поддерживается только для вопросов, тестов и материалов"}
                            onClick={() => void rollback(row)}
                          >
                            {busy === "rollback-" + row.id ? "Откат…" : "Откатить"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {detail && (
                      <tr className="border-b bg-slate-50/60">
                        <td colSpan={5} className="px-3 py-3">
                          {detail.row_missing ? (
                            <p className="text-xs text-[var(--status-warn-fg)]">
                              Исходная запись удалена — автоматическое восстановление удалённых строк отключено.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              <DiffTable detail={detail} />
                              {detail.truncated && (
                                <p className="text-[11px] text-slate-500">Длинные значения показаны сокращённо.</p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">{offset + 1}–{offset + rows.length} из {total}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!hasPrev || loading} onClick={() => void load(table, Math.max(offset - PAGE_SIZE, 0))}>
              Назад
            </button>
            <button type="button" className="btn-secondary" disabled={!hasNext || loading} onClick={() => void load(table, offset + PAGE_SIZE)}>
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Построчный diff: только поля, которые отличаются от текущей записи. */
function DiffTable({ detail }: { detail: AuditDetail }) {
  const keys = detail.fields.length
    ? detail.fields
    : [...new Set([...Object.keys(detail.snapshot), ...Object.keys(detail.current || {})])];
  const changed = keys.filter((key) => {
    const before = detail.snapshot[key];
    const after = (detail.current || {})[key];
    return JSON.stringify(before) !== JSON.stringify(after);
  });
  if (!changed.length) {
    return <p className="text-xs text-slate-500">Эта версия совпадает с текущей записью — откатывать нечего.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1 pr-3 font-semibold">Поле</th>
          <th className="py-1 pr-3 font-semibold">В версии №{detail.version.version_no ?? "—"}</th>
          <th className="py-1 font-semibold">Сейчас</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((key) => (
          <tr key={key} className="border-t border-slate-200 align-top">
            <td className="py-1 pr-3 font-mono text-[11px] text-slate-600">{key}</td>
            <td className="py-1 pr-3 text-[var(--status-ok-fg)]">{formatValue(detail.snapshot[key])}</td>
            <td className="py-1 text-[var(--status-critical-fg)]">{formatValue((detail.current || {})[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
