"use client";

/** Модерация: журнал фиксов с окном отката 24 часа. */
import { History, RotateCcw } from "lucide-react";
import { formatModerationDate, formatModerationValue } from "@/components/admin/panels/model";

export function ModerationFixLog({
  actions,
  loading,
  busy,
  onRevert,
}: {
  actions: any[];
  loading: boolean;
  busy: string;
  onRevert: (id: string) => void;
}) {
  return (
    <section className="card space-y-2 p-4">
      <h2 className="flex items-center gap-2 font-bold"><History className="h-4 w-4" />Журнал фиксов</h2>
      {loading ? <p className="text-sm text-slate-500">Загрузка…</p> : actions.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Пока пусто.</p> : actions.map((action) => {
        const canRevert = !action.reverted_at && Date.parse(String(action.revertible_until)) > Date.now();
        return (
          <article key={action.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <b className="flex-1">{action.action === "merge_topics" ? "Слияние тем" : action.target_type} · {action.actor_role}</b>
              <span className="text-[11px] text-slate-400">{formatModerationDate(action.created_at)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{action.reason || "без комментария"}</p>
            <p className="text-[11px] text-slate-500">
              {action.before && typeof action.before === "object" ? Object.entries(action.before).filter(([key]) => !key.endsWith("_ids")).map(([key, value]) => `${key}: ${formatModerationValue(value)}`).join(" · ") : ""}
            </p>
            {action.reverted_at ? <p className="text-[11px] text-slate-400">Отменено {formatModerationDate(action.reverted_at)}</p> : canRevert ? (
              <button type="button" onClick={() => onRevert(action.id)} disabled={busy === action.id} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold"><RotateCcw className="h-3.5 w-3.5" />Откатить</button>
            ) : <p className="text-[11px] text-slate-400">Окно отката истекло</p>}
          </article>
        );
      })}
    </section>
  );
}
