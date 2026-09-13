"use client";

import { useState } from "react";
import { ClipboardList, Calendar, Upload, Check } from "lucide-react";
import { homeworks as initial } from "@/lib/mock-data";
import type { HomeworkItem } from "@/types";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    overdue: "bg-danger/15 text-danger",
    submitted: "bg-primary/15 text-primary",
    graded: "bg-success/15 text-success",
  };
  const labels: Record<string, string> = {
    pending: "К выполнению",
    overdue: "Просрочено",
    submitted: "Сдано",
    graded: "Оценено",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100"}`}>
      {labels[status] || status}
    </span>
  );
}

export default function HomeworkPage() {
  const [items, setItems] = useState<HomeworkItem[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");

  const filtered = items.filter((h) => {
    if (filter === "pending") return h.status === "pending" || h.status === "overdue";
    if (filter === "done") return h.status === "submitted" || h.status === "graded";
    return true;
  });

  function submitWork(id: string) {
    setItems((prev) =>
      prev.map((h) =>
        h.id === id && (h.status === "pending" || h.status === "overdue")
          ? { ...h, status: "submitted" as const }
          : h
      )
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Задания</h1>
          <p className="mt-1 text-gray-500">Домашние задания вашей группы</p>
        </div>
        <div className="flex gap-2">
          {([["all", "Все"], ["pending", "Активные"], ["done", "Сданные"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === key ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600"
              }`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        {filtered.map((hw) => (
          <article key={hw.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm text-primary"><ClipboardList className="h-4 w-4" />{hw.subject}</div>
                <h2 className="mt-1 text-lg font-semibold">{hw.title}</h2>
                <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-500"><Calendar className="h-4 w-4" />Срок: {hw.dueAt}</div>
                {hw.grade != null && (
                  <div className="mt-1 text-sm font-medium text-success">Оценка: {hw.grade}{hw.feedback ? ` — ${hw.feedback}` : ""}</div>
                )}
              </div>
              <StatusBadge status={hw.status} />
            </div>
            {openId === hw.id && hw.description && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{hw.description}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setOpenId(openId === hw.id ? null : hw.id)}>
                {openId === hw.id ? "Скрыть" : "Подробнее"}
              </button>
              {(hw.status === "pending" || hw.status === "overdue") && (
                <button type="button" className="btn-primary inline-flex items-center gap-1.5 text-sm" onClick={() => submitWork(hw.id)}>
                  <Upload className="h-4 w-4" /> Сдать работу
                </button>
              )}
              {hw.status === "submitted" && (
                <span className="inline-flex items-center gap-1 text-sm text-primary"><Check className="h-4 w-4" /> Ожидает проверки</span>
              )}
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <div className="card p-12 text-center text-gray-500">Нет заданий в этом фильтре.</div>}
    </div>
  );
}
