"use client";

/** Мастерская: очередь публикаций на проверке. */
import Link from "next/link";
import { AlertTriangle, Check, EyeOff, ShieldCheck, X } from "lucide-react";
import { WORKSHOP_KIND_LABEL, formatWorkshopDate } from "@/components/admin/panels/model";

export function WorkshopQueue({
  queue,
  canModerate,
  moderationNote,
  onNote,
  busy,
  onModerate,
}: {
  queue: any[];
  canModerate: boolean;
  moderationNote: Record<string, string>;
  onNote: (itemId: string, value: string) => void;
  busy: string;
  onModerate: (id: string, action: "approve" | "reject" | "hide" | "unhide") => void;
}) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />На проверке ({queue.length})</h2>
      {queue.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-slate-500">Очередь пуста.</p> : (
        <div className="space-y-3">
          {queue.map((item) => (
            <article key={item.id} className="rounded-xl border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{WORKSHOP_KIND_LABEL[item.kind] || item.kind}</span>
                    {item.status === "hidden" && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--status-warn-fg)]">скрыт</span>}
                    {Number(item.report_count) > 0 && <span className="rounded-full bg-[var(--status-critical-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--status-critical-fg)]">жалоб: {item.report_count}</span>}
                  </div>
                  <Link href="/workshop" className="mt-1 block truncate font-bold hover:text-indigo-600">{item.title}</Link>
                  <p className="text-xs text-slate-500">{formatWorkshopDate(item.created_at)} · v{item.version_no}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => onModerate(item.id, "approve")} disabled={busy.startsWith(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-[var(--status-ok-fg)] px-2.5 py-1.5 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" />Одобрить</button>
                  <button type="button" onClick={() => onModerate(item.id, "reject")} disabled={busy.startsWith(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)]"><X className="h-3.5 w-3.5" />Отклонить</button>
                  {item.status !== "hidden" && <button type="button" onClick={() => onModerate(item.id, "hide")} disabled={busy.startsWith(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"><EyeOff className="h-3.5 w-3.5" />Скрыть</button>}
                  {/* Блок 1: хим-тесты из Workshop становятся полноценными вопросами банка. */}
                  {item.kind === "test_questions" && canModerate && (
                    <Link href={`/admin/workshop-convert?item=${item.id}`} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">Сделать тестом</Link>
                  )}
                </div>
              </div>
              {!!item.personal_data_flags?.length && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--status-warn-bg)] p-2 text-xs text-[var(--status-warn-fg)]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Метки: {item.personal_data_flags.join(", ")}</p>
              )}
              <input value={moderationNote[item.id] || ""} onChange={(event) => onNote(item.id, event.target.value)} placeholder="Комментарий автору (необязательно)" className="mt-2 w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs" />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
