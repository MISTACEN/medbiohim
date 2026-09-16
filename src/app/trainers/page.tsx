"use client";

import { useEffect, useState } from "react";
import { getTrainer, listTrainers } from "@/lib/api";
import { Loader2 } from "lucide-react";

type TrainerMeta = { id: string; title: string; subject: string; row_count: number };

export default function TrainersPage() {
  const [items, setItems] = useState<TrainerMeta[]>([]);
  const [active, setActive] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTrainers().then((res) => {
      setLoading(false);
      if (res.ok) setItems(res.data.items as TrainerMeta[]);
      else setNote(res.error.message);
    });
  }, []);

  async function open(id: string) {
    const res = await getTrainer(id);
    if (res.ok) setActive(res.data.trainer);
    else setNote(res.error.message);
  }

  const columns = (active?.columns as string[]) || [];
  const rows = (active?.rows as Array<Record<string, string>>) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Тренажёры</h1>
        <p className="page-subtitle">Паразитология · matching-таблицы</p>
      </div>
      {note && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{note}</div>}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((t) => (
            <button key={t.id} type="button" onClick={() => open(t.id)} className="card p-4 text-left transition hover:shadow-md">
              <div className="text-xs text-slate-400">{t.subject}</div>
              <div className="font-semibold">{t.title}</div>
              <div className="mt-1 text-xs text-slate-500">{t.row_count} строк</div>
            </button>
          ))}
        </div>
      )}
      {active && (
        <div className="card overflow-x-auto p-4">
          <h2 className="mb-3 font-semibold">{String(active.title || "")}</h2>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-400">
                {columns.map((c) => (<th key={c} className="px-2 py-2">{c}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  {columns.map((c) => (<td key={c} className="px-2 py-2">{row[c] || "—"}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
