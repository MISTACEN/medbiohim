"use client";

/** Модерация: уведомления staff. */
import { formatModerationDate } from "@/components/admin/panels/model";

export function ModerationNotifications({
  notifications,
  onMarkRead,
}: {
  notifications: any[];
  onMarkRead: () => void;
}) {
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Уведомления</h2>
        {notifications.some((item) => !item.read_at) && <button type="button" onClick={onMarkRead} className="text-xs font-semibold text-indigo-600">Прочитать все</button>}
      </div>
      {notifications.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Нет уведомлений.</p> : notifications.map((item) => (
        <article key={item.id} className={"rounded-xl border p-3 text-sm " + (item.read_at ? "border-[var(--border)]" : "border-indigo-200 bg-indigo-50/40")}>
          <b>{item.title}</b>
          <p className="text-xs text-slate-600">{item.body}</p>
          <p className="text-[11px] text-slate-400">{formatModerationDate(item.created_at)}</p>
        </article>
      ))}
    </section>
  );
}
