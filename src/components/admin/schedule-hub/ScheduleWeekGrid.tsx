"use client";

/** CMS · Сетка недели: таблица слотов с drag-and-drop занятий. */
import type { ScheduleItem } from "@/lib/api";
import { SLOTS, TYPE_LABELS, timeToMinutes } from "@/components/admin/schedule-hub/model";

export function ScheduleWeekGrid({
  days,
  grouped,
  onDropCell,
  onDragItem,
  onOpenItem,
}: {
  days: Array<{ date: Date; key: string }>;
  grouped: Map<string, ScheduleItem[]>;
  onDropCell: (date: string, hour: number, e?: { preventDefault?: () => void; stopPropagation?: () => void }) => void;
  onDragItem: (id: string) => void;
  onOpenItem: (item: ScheduleItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="border-b p-2 text-left"> </th>
            {days.map((d) => (
              <th key={d.key} className="border-b p-2 text-center font-semibold">
                {d.date.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((hour) => (
            <tr key={hour}>
              <td className="border-b px-2 py-6 text-xs text-slate-400">{String(hour).padStart(2, "0")}:00</td>
              {days.map((d) => {
                const cell = (grouped.get(d.key) || []).filter((x) => Math.floor(timeToMinutes(x.start_time) / 60) === hour);
                return (
                  <td
                    key={d.key + hour}
                    className="border-b border-l p-1 align-top"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDropCell(d.key, hour, e)}
                  >
                    {cell.map((it) => (
                      <div
                        key={it.id}
                        draggable
                        onDragStart={() => onDragItem(String(it.id))}
                        onClick={() => onOpenItem(it)}
                        className="mb-1 cursor-grab rounded-lg bg-indigo-50 px-2 py-1 text-left text-xs shadow-sm hover:bg-indigo-100"
                      >
                        <div className="font-semibold">{it.subject_name || "—"}</div>
                        <div className="text-[10px] text-slate-500">{it.teacher || ""}{it.week_parity ? ` · ${it.week_parity === "numerator" ? "числ." : it.week_parity === "denominator" ? "знам." : "все"}` : ""}</div>
                        <div className="text-[10px] text-slate-500">{TYPE_LABELS[it.type || ""] || it.type} · {(it.start_time || "").slice(0, 5)}</div>
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
