"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Calendar, Upload, Check, Loader2 } from "lucide-react";
import { homeworks as initial } from "@/lib/mock-data";
import type { HomeworkItem } from "@/types";
import { listHomeworks, submitHomework, uploadFile, type ApiHomework } from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-800",
    overdue: "bg-red-50 text-red-700",
    submitted: "bg-blue-50 text-blue-700",
    graded: "bg-emerald-50 text-emerald-700",
  };
  const labels: Record<string, string> = {
    pending: "К сдаче",
    overdue: "Просрочено",
    submitted: "Сдано",
    graded: "Оценено",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100"}`}>{labels[status] || status}</span>;
}

function mapApi(h: ApiHomework): HomeworkItem {
  let status: HomeworkItem["status"] = "pending";
  if (h.submission_status === "graded" || h.grade != null) status = "graded";
  else if (h.submission_status === "submitted" || h.submission_id) status = "submitted";
  else if (h.due_at && new Date(h.due_at) < new Date()) status = "overdue";
  return {
    id: h.id,
    title: h.title,
    subject: h.subject_name || "—",
    dueAt: h.due_at ? h.due_at.slice(0, 10) : "—",
    status,
    description: h.description || "",
  };
}

export default function HomeworkPage() {
  const [items, setItems] = useState<HomeworkItem[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");
  const [source, setSource] = useState<"mock" | "api">("mock");
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const res = await listHomeworks();
      if (res.ok && res.data.items.length > 0) {
        setItems(res.data.items.map(mapApi));
        setSource("api");
        setNote(null);
        return;
      }
      if (!res.ok) setNote(`API: ${res.error.message} — mock`);
    } catch {
      setNote("API недоступен — mock");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = items.filter((h) => {
    if (filter === "pending") return h.status === "pending" || h.status === "overdue";
    if (filter === "done") return h.status === "submitted" || h.status === "graded";
    return true;
  });

  async function submitWork(id: string, file?: File | null) {
    setBusy(true);
    try {
      let fileId: string | undefined;
      if (file) {
        const up = await uploadFile(file);
        if (!up.ok) {
          setNote(up.error.message);
          setBusy(false);
          return;
        }
        fileId = up.data.file.id;
      }
      if (source === "api") {
        const res = await submitHomework(id, text || undefined, fileId);
        if (!res.ok) {
          setNote(res.error.message);
          setBusy(false);
          return;
        }
        await reload();
        setOpenId(null);
        setText("");
        setNote("Работа отправлена");
      } else {
        setItems((prev) =>
          prev.map((h) =>
            h.id === id && (h.status === "pending" || h.status === "overdue")
              ? { ...h, status: "submitted" as const }
              : h
          )
        );
        setOpenId(null);
      }
    } catch {
      setNote("Ошибка отправки (login + API)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Задания</h1>
          <p className="mt-1 text-gray-500">Источник: {source}{note ? ` · ${note}` : ""}</p>
        </div>
        <div className="flex gap-2">
          {([["all", "Все"], ["pending", "Активные"], ["done", "Сданные"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === key ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {filtered.map((h) => (
          <div key={h.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><ClipboardList className="h-5 w-5" /></div>
                <div>
                  <div className="font-medium">{h.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{h.subject}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{h.dueAt}</span>
                    <StatusBadge status={h.status} />
                  </div>
                </div>
              </div>
              {(h.status === "pending" || h.status === "overdue") && (
                <button type="button" onClick={() => setOpenId(openId === h.id ? null : h.id)} className="rounded-lg border px-3 py-1.5 text-sm">Сдать</button>
              )}
              {h.status === "submitted" && (<span className="inline-flex items-center gap-1 text-sm text-blue-600"><Check className="h-4 w-4" /> Отправлено</span>)}
            </div>
            {openId === h.id && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <p className="text-sm text-gray-600">{h.description}</p>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Комментарий" className="w-full rounded-lg border px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <Upload className="h-4 w-4" /> Файл
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) submitWork(h.id, f); }} />
                  </label>
                  <button type="button" disabled={busy} onClick={() => submitWork(h.id, null)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Отправить
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
