/**
 * Карточка занятия в сетке дня (ЗАДАЧА A4): вынесена из монолита
 * app/schedule/page.tsx.
 */
"use client";
import { Clock, MapPin } from "lucide-react";
import type { ScheduleItem } from "@/lib/api";
import {
  GRID_START_MIN,
  PX_PER_MIN,
  TYPE_CLASS,
  TYPE_COLORS,
  TYPE_LABELS,
  attendanceLabel,
  breakRange,
  formatMinutes,
  subjectColor,
  timeToMinutes,
} from "./utils";
import type { ScheduleMeta } from "@/lib/api";
import type { SemesterRange } from "./utils";


export default function ScheduleCard({
  item, onOpen, col = 0, cols = 1,
}: {
  item: ScheduleItem;
  onOpen: (item: ScheduleItem) => void;
  col?: number;
  cols?: number;
}) {
  const start = timeToMinutes(item.start_time);
  const end = timeToMinutes(item.end_time);
  const top = Math.max(0, (start - GRID_START_MIN) * PX_PER_MIN);
  const height = Math.max(66, (end - start) * PX_PER_MIN);
  const type = TYPE_CLASS[item.type || ""] || TYPE_CLASS.other;
  const subject = item.subject_name || "Занятие";
  const location = [item.building, item.room].filter(Boolean).join(", ");
  const typeLabel = TYPE_LABELS[item.type || ""] || "Занятие";
  const accent = subjectColor(item);
  const typeColor = TYPE_COLORS[item.type || ""] || TYPE_COLORS.other;
  const attendance = item.attendance_status as string | undefined;
  const parityLabel =
    item.week_parity === "numerator" ? "числитель" :
    item.week_parity === "denominator" ? "знаменатель" :
    item.week_parity === "all" ? "каждую неделю" : null;
  const gap = 3;
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(item); }}
      className={`schedule-card absolute cursor-pointer overflow-hidden rounded-xl border p-2 shadow-sm transition hover:z-20 hover:-translate-y-0.5 hover:shadow-md ${type} ${item.is_cancelled ? "schedule-cancelled" : ""} ${item.is_makeup ? "opacity-60" : ""}`}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 24%, var(--card)), color-mix(in srgb, ${accent} 10%, var(--card)))`,
        border: `1px solid color-mix(in srgb, ${typeColor} 42%, var(--border))`,
        borderLeft: `4px ${item.is_makeup ? "dashed" : "solid"} ${accent}`,
        boxShadow: `inset 0 3px 0 ${typeColor}66, 0 1px 3px rgba(15,23,42,.08)`,
        top,
        height,
        minHeight: height,
        left: `calc(${leftPct}% + ${gap}px)`,
        width: `calc(${widthPct}% - ${gap * 2}px)`,
        zIndex: 4 + col,
      }}
      title={[
        subject,
        `${formatMinutes(start)}–${formatMinutes(end)}`,
        typeLabel,
        item.academic_hours ? `${item.academic_hours} ак. ч.` : null,
        parityLabel,
        item.notes,
        location,
      ].filter(Boolean).join(" · ")}
    >
      {(() => {
        const breaks = (item.breaks || [])
          .map((value: string) => breakRange(value))
          .filter(Boolean) as Array<{start:number;end:number}>;
        const points = [start, ...breaks.flatMap((b) => [b.start, b.end]), end].sort((a,b) => a-b);
        const segments: Array<{start:number;end:number;isBreak:boolean}> = [];
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          if (b <= a) continue;
          const isBreak = breaks.some((br) => br.start === a && br.end === b);
          segments.push({start:a,end:b,isBreak});
        }

        let lessonPart = 0;
        return segments.map((seg, index) => {
          const topPct = ((seg.start - start) / Math.max(1, end - start)) * 100;
          const heightPct = ((seg.end - seg.start) / Math.max(1, end - start)) * 100;

          if (seg.isBreak) {
            return (
              <div
                key={"segment-break-" + index}
                className="absolute left-0 right-0 z-10 flex items-center justify-center border-y border-dashed border-slate-400/50 bg-slate-100/90 text-[9px] font-bold text-slate-600"
                style={{top: topPct + "%", height: heightPct + "%"}}
              >
                Перерыв · {formatMinutes(seg.start)}–{formatMinutes(seg.end)}
              </div>
            );
          }

          lessonPart++;
          const label = lessonPart > 1 ? `${subject} · продолжение` : subject;

          return (
            <div
              key={"segment-lesson-" + index}
              className="absolute left-0 right-0 overflow-hidden px-2 py-1.5"
              style={{top: topPct + "%", height: heightPct + "%"}}
            >
              <div className={`line-clamp-2 text-[12px] font-bold leading-tight sm:text-[13px] ${item.is_cancelled ? "line-through" : ""}`}>
                {label}
              </div>

              <div className="mt-0.5 text-[10px] font-semibold opacity-75">
                {formatMinutes(seg.start)}–{formatMinutes(seg.end)}
              </div>

              {lessonPart === 1 && (
                <div className="mt-1 space-y-0.5 text-[9px] font-semibold leading-tight opacity-75">
                  <div className="truncate">
                    {item.is_makeup ? "ОТРАБОТКА" : typeLabel}
                    {!item.is_makeup ? "" : ` · ${typeLabel}`}
                    {item.academic_hours ? ` · ${item.academic_hours} ак. ч.` : ""}
                    {parityLabel ? ` · ${parityLabel}` : ""}
                  </div>
                  {item.notes && height >= 130 && (
                    <div className="line-clamp-2 font-medium">
                      {item.notes}
                    </div>
                  )}
                  {location && cols === 1 && height >= 120 && (
                    <div className="truncate">
                      <MapPin className="mr-0.5 inline h-2.5 w-2.5" />
                      {location}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        });
      })()}

      {item.is_makeup && <div className="absolute right-2 top-1 z-20 rounded bg-white/80 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide" style={{color:accent}}>Отработка</div>}
      {attendance && <div className="absolute bottom-1 right-1 z-20 rounded-full bg-white/85 px-1.5 py-0.5 text-[8px] font-bold">{attendanceLabel(attendance)}</div>}
      {item.is_cancelled && <div className="absolute right-2 top-1 z-20 text-[9px] font-bold">ОТМЕНЕНО</div>}
    </article>
  );
}

/**
 * D9: совокупный результат загрузки страницы расписания — расписание, мета
 * (периоды) и planner (ДЗ/проработка) одним объектом.
 */
export type ScheduleBundle = {
  items: ScheduleItem[];
  source: string;
  meta: ScheduleMeta;
  homeworks: any[];
  recovery: any[];
  message: string | null;
  range: SemesterRange;
};

