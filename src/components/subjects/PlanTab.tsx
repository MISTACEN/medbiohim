import type { TabId } from "./tabs-config";
import { setTopicPyramid } from "@/lib/api/subjects";

"use client";

import { useState } from "react";

/**
 * Вкладка «Учебный план» предмета (ЗАДАЧА A5 шаг 3): лента PlanTimeline
 * или модули с темами и статусами. Вынесено из монолита subjects/[id]/page.tsx.
 */
import { PlanTimeline } from "@/components/subjects/PlanTimeline";

const TOPIC_STATUS_LABEL: Record<string, string> = {
  pending: "не начато",
  in_progress: "в процессе",
  passed: "сдано",
  failed: "не сдано",
  retake_needed: "отработка",
};
const TOPIC_STATUS_CLASS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  in_progress: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  passed: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
  failed: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
  retake_needed: "bg-orange-100 text-orange-800",
};

type Props = {
  plan: any;
  resourceErrors: Record<string, string | null>;
  planSessions: any[];
  planSummary?: { total: number; passed: number; in_progress: number; failed_or_retake: number; unopened_materials?: number } | null;
  modules: any[];
  topicItems: any[];
  topicProgressById: Map<string, any>;
  topicBusy: string | null;
  cycleTopicStatus: (topicId: string, status: string) => void;
  openTopicMaterial: (topicId: string, material: any) => void;
  onSelectTab: (tab: string | TabId) => void;
  onOpenLecture: (id: string) => void;
  isAdmin: boolean;
};

export function PlanTab({ plan, resourceErrors, planSessions, planSummary, modules, topicItems, topicProgressById, topicBusy, cycleTopicStatus, openTopicMaterial, onSelectTab, onOpenLecture, isAdmin }: Props) {
  return (
    <section className="card p-5">
            <h2 className="text-lg font-bold">Учебный план</h2>
            <p className="mt-1 text-sm text-slate-500">
              {plan ? (plan.control || "Контроль не указан") + " · " + (plan.weeks || []).length + " занятий" : resourceErrors.plan || "План ещё не загружен."}
            </p>
            <PyramidPanel topicItems={topicItems} isAdmin={isAdmin} />
            {plan?.weeks?.length ? (
              // Единая лента плана: ближайшее занятие крупно сверху, предстоящие
              // списком, прошедшие — свёрнуты. Связки переключают вкладки предмета.
              <div className="mt-4">
                <PlanTimeline
                  sessions={planSessions}
                  links={{ onOpenTab: (t) => onSelectTab(t), onOpenLecture: onOpenLecture }}
                  emptyLabel="В плане пока нет занятий."
                />
              </div>
            ) : modules.length ? (
              <div className="mt-4 space-y-2">
                {planSummary && planSummary.total > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-2 text-sm">
                    <b>Мой прогресс:</b>
                    <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-ok-fg)]">
                      сдано {planSummary.passed} из {planSummary.total}
                    </span>
                    {planSummary.in_progress > 0 && (
                      <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-xs text-[var(--status-warn-fg)]">в процессе {planSummary.in_progress}</span>
                    )}
                    {planSummary.failed_or_retake > 0 && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">отработка {planSummary.failed_or_retake}</span>
                    )}
                    {Number(planSummary.unopened_materials || 0) > 0 && (
                      <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-xs text-[var(--status-warn-fg)]">не открыто материалов: {planSummary.unopened_materials}</span>
                    )}
                    <span className="text-xs text-slate-500">отметка видна только вам</span>
                  </div>
                )}
                {resourceErrors.topicProgress && (
                  <div className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-2 text-sm text-[var(--status-critical-fg)]">{resourceErrors.topicProgress}</div>
                )}
                {modules.map((m, i) => (
                  <details key={m.id || i} className="rounded-xl border" open={i === 0}>
                    <summary className="cursor-pointer px-4 py-3 font-semibold">{m.title || "Модуль " + (i + 1)}</summary>
                    <div className="border-t px-4 py-2 text-sm">
                      {(m.topics || []).map((tp: any, j: number) => {
                        const item = topicProgressById.get(String(tp.id));
                        const status = item?.status || "pending";
                        const nextDate = (item?.schedule_dates || [])[0];
                        return (
                          <div key={tp.id || j} className="border-b py-2 last:border-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={topicBusy === String(tp.id)}
                                onClick={() => cycleTopicStatus(String(tp.id), status)}
                                title="Клик меняет статус: не начато → в процессе → сдано → не сдано → отработка. Отметка видна только вам."
                                className={"rounded-full px-2 py-0.5 text-xs font-semibold disabled:opacity-50 " + (TOPIC_STATUS_CLASS[status] || TOPIC_STATUS_CLASS.pending)}
                              >
                                {TOPIC_STATUS_LABEL[status] || TOPIC_STATUS_LABEL.pending}
                              </button>
                              <span className="flex-1">{tp.title}</span>
                              {(item?.tests_count || 0) > 0 && (
                                <button type="button" onClick={() => onSelectTab("tests")} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100">
                                  📝 тестов: {item.tests_count}
                                </button>
                              )}
                              {(item?.exam_questions_count || 0) > 0 && (
                                <button type="button" onClick={() => onSelectTab("exam")} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100">
                                  ❓ вопросов: {item.exam_questions_count}
                                </button>
                              )}
                              {(item?.materials || []).map((material: any) => (
                                <button
                                  key={material.id}
                                  type="button"
                                  onClick={() => void openTopicMaterial(String(tp.id), material)}
                                  title={material.opened ? "Материал уже открыт" : "Ещё не открыт — откроется и отметится"}
                                  className={"max-w-[220px] truncate rounded-full px-2 py-0.5 text-xs " + (material.opened ? "bg-slate-100 text-slate-500" : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] hover:opacity-80")}
                                >
                                  {material.opened ? "✓ " : "• "}{material.title}
                                </button>
                              ))}
                              {(item?.unopened_materials_count || 0) > 0 && (
                                <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-warn-fg)]">
                                  не открыто: {item.unopened_materials_count}
                                </span>
                              )}
                              {nextDate?.date && (
                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700" title="Занятие по расписанию, привязанное к теме">
                                  📅 {nextDate.date.slice(5)}{nextDate.type ? " · " + nextDate.type : ""}
                                </span>
                              )}
                            </div>
                            {item?.grade ? (
                              <div className="mt-1 text-xs text-slate-500">Оценка: {item.grade}</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            ) : null}
          </section>
  );
}


/** Уровни пирамиды знаний: 1 — База, 2 — Понимание, 3 — Применение. */
const PYRAMID = [
  { level: 1, label: "База", color: "var(--status-ok-fg)", bg: "var(--status-ok-bg)" },
  { level: 2, label: "Понимание", color: "var(--primary)", bg: "var(--primary-soft, #eef2ff)" },
  { level: 3, label: "Применение", color: "var(--status-warn-fg)", bg: "var(--status-warn-bg)" },
] as const;

/**
 * Пирамида знаний (ЭТАП 6): индикатор готовности по уровням. База — первый
 * приоритет: пока она не закрыта, к занятию идти рано. Считается по темам
 * предмета: сдано/всего на каждом уровне.
 */
function PyramidPanel({ topicItems, isAdmin }: { topicItems: any[]; isAdmin: boolean }) {
  const [busy, setBusy] = useState("");
  if (!topicItems.length) return null;
  const levels = PYRAMID.map(({ level, label, color, bg }) => {
    const rows = topicItems.filter((t) => t.knowledge_level === level);
    const done = rows.filter((t) => t.status === "passed").length;
    return { level, label, color, bg, total: rows.length, done };
  }).filter((l) => l.total > 0);
  const unassigned = topicItems.filter((t) => t.knowledge_level == null);
  const base = levels.find((l) => l.level === 1);
  const basePct = base && base.total ? Math.round((base.done / base.total) * 100) : 0;
  const ready = !base || basePct >= 100;
  async function setLevel(topicId: string, level: number | null) {
    setBusy(topicId);
    await setTopicPyramid(topicId, level);
    setBusy("");
    window.location.reload();
  }
  return (
    <div className="mt-3 space-y-2">
      {base && (
        <div className={"rounded-xl px-4 py-2.5 text-sm font-bold " + (ready ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]")}>
          {ready ? "База закрыта — можно идти к следующему занятию" : `Готовность к занятию: ${basePct}% базы сдано (${base.done}/${base.total})`}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {levels.map((l) => (
          <span key={l.level} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: l.bg, color: l.color }}>
            {l.label}: {l.done}/{l.total}
          </span>
        ))}
      </div>
      {isAdmin && unassigned.length > 0 && (
        <details className="rounded-xl border p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[var(--muted)]">
            Разметить уровни ({unassigned.length} тем без уровня) — админ
          </summary>
          <div className="mt-2 space-y-1">
            {unassigned.slice(0, 20).map((t) => (
              <div key={t.topic_id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {[1, 2, 3].map((l) => (
                  <button key={l} type="button" disabled={busy === t.topic_id}
                    onClick={() => void setLevel(t.topic_id, l)}
                    className="rounded-lg border px-2 py-0.5 text-[11px] font-bold hover:bg-indigo-50">
                    {l === 1 ? "База" : l === 2 ? "Поним." : "Примен."}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
