"use client";

import { useEffect, useMemo, useState } from "react";
import { getTrainer, listTrainers, createSession, updateSession } from "@/lib/api";
import { Loader2, Shuffle, Check, X } from "lucide-react";

type TrainerMeta = { id: string; title: string; subject: string; row_count: number };

export default function TrainersPage() {
  const [items, setItems] = useState<TrainerMeta[]>([]);
  const [active, setActive] = useState<Record<string, unknown> | null>(null);
  const [mode, setMode] = useState<"table" | "match">("table");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<Array<{ left: string; right: string; key: string }>>([]);
  const [shuffledRight, setShuffledRight] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string, string>>({});
  const [wrong, setWrong] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    listTrainers().then((res) => {
      setLoading(false);
      if (res.ok) setItems(res.data.items as TrainerMeta[]);
      else setNote(res.error.message);
    });
  }, []);

  const columns = (active?.columns as string[]) || [];
  const rows = (active?.rows as Array<Record<string, string>>) || [];

  async function open(id: string) {
    const res = await getTrainer(id);
    if (!res.ok) {
      setNote(res.error.message);
      return;
    }
    const t = res.data.trainer;
    setActive(t);
    setMode("table");
    setMatched({});
    setWrong(null);
    const cols = (t.columns as string[]) || [];
    const rws = (t.rows as Array<Record<string, string>>) || [];
    const leftKey = cols[0] || "name";
    const rightKey = cols[1] || cols.find((c) => c !== leftKey) || "disease";
    const built = rws
      .map((row, i) => ({
        left: String(row[leftKey] || "").trim(),
        right: String(row[rightKey] || "").trim(),
        key: `r-${i}`,
      }))
      .filter((p) => p.left && p.right);
    setPairs(built);
    setShuffledRight([...built.map((p) => p.right)].sort(() => Math.random() - 0.5));
    const sess = await createSession({
      type: "trainer",
      ref_id: id,
      title: String(t.title || id),
      payload: { leftKey, rightKey },
    });
    if (sess.ok) setSessionId(String(sess.data.session.id));
  }

  function pickLeft(left: string) {
    setSelectedLeft(left);
    setWrong(null);
  }

  function pickRight(right: string) {
    if (!selectedLeft) return;
    const ok = pairs.find((p) => p.left === selectedLeft && p.right === right);
    if (ok) {
      const next = { ...matched, [selectedLeft]: right };
      setMatched(next);
      setSelectedLeft(null);
      setWrong(null);
      if (sessionId) {
        void updateSession(sessionId, {
          answers: next,
          status: Object.keys(next).length >= pairs.length ? "finished" : "in_progress",
          score: Object.keys(next).length,
        });
      }
    } else {
      setWrong(right);
    }
  }

  const leftRemaining = useMemo(
    () => pairs.filter((p) => !matched[p.left]).map((p) => p.left),
    [pairs, matched]
  );
  const rightRemaining = useMemo(
    () => shuffledRight.filter((r) => !Object.values(matched).includes(r)),
    [shuffledRight, matched]
  );
  const done = pairs.length > 0 && Object.keys(matched).length >= pairs.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Тренажёры</h1>
        <p className="page-subtitle">Таблица или интерактивное сопоставление · с resume-сессией</p>
      </div>
      {note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{note}</div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{String(active.title || "")}</h2>
            <button type="button" className={`rounded-full px-3 py-1 text-xs ${mode === "table" ? "bg-primary text-white" : "bg-slate-100"}`} onClick={() => setMode("table")}>Таблица</button>
            <button type="button" className={`rounded-full px-3 py-1 text-xs ${mode === "match" ? "bg-primary text-white" : "bg-slate-100"}`} onClick={() => setMode("match")}>Сопоставление</button>
            {mode === "match" && (
              <button type="button" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs" onClick={() => { setMatched({}); setShuffledRight([...pairs.map((p) => p.right)].sort(() => Math.random() - 0.5)); }}>
                <Shuffle className="h-3 w-3" /> Перемешать
              </button>
            )}
          </div>

          {mode === "table" ? (
            <div className="card overflow-x-auto p-4">
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
          ) : (
            <div className="card space-y-4 p-5">
              {done ? (
                <div className="flex items-center gap-2 text-emerald-600"><Check className="h-5 w-5" /> Все пары сопоставлены</div>
              ) : (
                <p className="text-sm text-slate-500">Выберите слева, затем справа. {Object.keys(matched).length}/{pairs.length}</p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  {leftRemaining.map((l) => (
                    <button key={l} type="button" onClick={() => pickLeft(l)} className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedLeft === l ? "border-primary bg-primary/10" : "border-slate-200"}`}>{l}</button>
                  ))}
                </div>
                <div className="space-y-2">
                  {rightRemaining.map((r) => (
                    <button key={r} type="button" onClick={() => pickRight(r)} className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${wrong === r ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}>
                      {wrong === r ? <span className="inline-flex items-center gap-1 text-rose-600"><X className="h-3 w-3" /> {r}</span> : r}
                    </button>
                  ))}
                </div>
              </div>
              {Object.keys(matched).length > 0 && (
                <ul className="text-sm text-slate-600">
                  {Object.entries(matched).map(([l, r]) => (
                    <li key={l} className="flex items-center gap-2"><Check className="h-3 w-3 text-emerald-500" />{l} → {r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
