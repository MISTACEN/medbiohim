"use client";

/** Аудит: построчный diff версии — только поля, отличающиеся от текущей записи. */
import { auditFormatValue, type AuditDetail } from "@/components/admin/panels/model";

export function AuditDiffTable({ detail }: { detail: AuditDetail }) {
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
            <td className="py-1 pr-3 text-[var(--status-ok-fg)]">{auditFormatValue(detail.snapshot[key])}</td>
            <td className="py-1 text-[var(--status-critical-fg)]">{auditFormatValue((detail.current || {})[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
