"use client";

/** Модерация: запросы старост (только для администраторов). */
import { Check, Send, X } from "lucide-react";
import { MODERATION_REQUEST_LABEL, formatModerationDate } from "@/components/admin/panels/model";

export function ModerationRequests({
  requests,
  notes,
  onNote,
  busy,
  onReview,
}: {
  requests: any[];
  notes: Record<string, string>;
  onNote: (requestId: string, value: string) => void;
  busy: string;
  onReview: (requestId: string, approve: boolean) => void;
}) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold"><Send className="h-4 w-4" />Запросы старост ({requests.filter((request) => request.status === "pending").length})</h2>
      {requests.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Запросов нет.</p> : (
        <div className="space-y-2">
          {requests.map((request) => (
            <article key={request.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b className="flex-1">{MODERATION_REQUEST_LABEL[request.kind] || request.kind}</b>
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (request.status === "pending" ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "bg-slate-100 text-slate-500")}>{request.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{request.reason || "Без комментария"}</p>
              <p className="text-[11px] text-slate-400">{formatModerationDate(request.created_at)} · {JSON.stringify(request.payload)}</p>
              {request.status === "pending" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input value={notes[request.id] || ""} onChange={(event) => onNote(request.id, event.target.value)} placeholder="Комментарий" className="min-w-[160px] flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs" />
                  <button type="button" onClick={() => onReview(request.id, true)} disabled={busy === request.id} className="inline-flex items-center gap-1 rounded-lg bg-[var(--status-ok-fg)] px-2.5 py-1.5 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" />Одобрить</button>
                  <button type="button" onClick={() => onReview(request.id, false)} disabled={busy === request.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"><X className="h-3.5 w-3.5" />Отклонить</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
