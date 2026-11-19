"use client";

/** Мастерская: жалобы на материалы. */
import { Flag } from "lucide-react";
import { formatWorkshopDate } from "@/components/admin/panels/model";

export function WorkshopReports({
  reports,
  busy,
  onCloseReport,
  onHideItem,
}: {
  reports: any[];
  busy: string;
  onCloseReport: (id: string, status: "resolved" | "dismissed") => void;
  onHideItem: (itemId: string) => void;
}) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-bold"><Flag className="h-4 w-4" />Жалобы ({reports.filter((report) => report.status === "open").length})</h2>
      {reports.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-slate-500">Жалоб нет.</p> : (
        <div className="space-y-2">
          {reports.map((report) => (
            <article key={report.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b className="min-w-0 flex-1 truncate">{report.item?.title || "Материал"}</b>
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (report.status === "open" ? "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]" : "bg-slate-100 text-slate-500")}>
                  {report.status === "open" ? "открыта" : report.status === "resolved" ? "закрыта" : "отклонена"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{report.reason}</p>
              <p className="text-[11px] text-slate-400">{formatWorkshopDate(report.created_at)}</p>
              {report.status === "open" && (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => onCloseReport(report.id, "resolved")} disabled={busy === report.id} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--status-ok-fg)]">Закрыть</button>
                  <button type="button" onClick={() => onCloseReport(report.id, "dismissed")} disabled={busy === report.id} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold">Отклонить</button>
                  <button type="button" onClick={() => { if (report.item?.id) onHideItem(String(report.item.id)); }} disabled={!report.item?.id || busy.startsWith(String(report.item?.id))} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--status-warn-fg)]">Скрыть материал</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
