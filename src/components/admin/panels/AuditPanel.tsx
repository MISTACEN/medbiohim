"use client";

/** Журнал версий контента: что менялось, чем отличается от текущего и откат. */
import { Fragment } from "react";
import Link from "next/link";
import { hasToken } from "@/lib/api";
import { AuditDiffTable } from "@/components/admin/panels/AuditDiffTable";
import { useAuditPanel } from "@/components/admin/panels/useAuditPanel";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_SOURCE_LABEL,
  AUDIT_TABLE_LABEL,
  auditFormatTime,
  auditRowId,
} from "@/components/admin/panels/model";

export function AuditPanel() {
  const panel = useAuditPanel();
  const {
    rows, total, offset, table, setTable,
    rollbackTables, loading, error, ok, details, busy,
    dialog, load, openDetail, rollback,
  } = panel;

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
            {Object.entries(AUDIT_TABLE_LABEL).map(([value, label]) => (
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
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{auditFormatTime(row.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{AUDIT_TABLE_LABEL[row.table_name] || row.table_name}</div>
                        <div className="text-xs text-slate-500">{auditRowId(row) || "—"}</div>
                      </td>
                      <td className="px-3 py-2">№{row.version_no ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div>{row.actor_name || "неизвестно"}</div>
                        <div className="text-xs text-slate-500">{AUDIT_SOURCE_LABEL[String(row.source)] || row.source || "—"}</div>
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
                              <AuditDiffTable detail={detail} />
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

      {total > AUDIT_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">{offset + 1}–{offset + rows.length} из {total}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!hasPrev || loading} onClick={() => void load(table, Math.max(offset - AUDIT_PAGE_SIZE, 0))}>
              Назад
            </button>
            <button type="button" className="btn-secondary" disabled={!hasNext || loading} onClick={() => void load(table, offset + AUDIT_PAGE_SIZE)}>
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
