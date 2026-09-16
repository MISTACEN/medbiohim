"use client";

import { useEffect, useState } from "react";
import { generateTicket, listTicketBanks, type BankQuestion } from "@/lib/api";
import { Loader2, RefreshCw, Eye } from "lucide-react";

type Bank = { id: string; title: string; subject: string; count: number };

export default function TicketsPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState("");
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    listTicketBanks().then((res) => {
      if (res.ok) {
        setBanks(res.data.items);
        if (res.data.items[0]) setBankId(res.data.items[0].id);
      } else setNote(res.error.message);
    });
  }, []);

  async function generate() {
    if (!bankId) return;
    setLoading(true);
    setReveal({});
    const res = await generateTicket(bankId, count, mode);
    setLoading(false);
    if (!res.ok) {
      setNote(res.error.message);
      return;
    }
    setQuestions(res.data.questions);
    setTitle(res.data.bank.title);
    setNote(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Билеты</h1>
        <p className="page-subtitle">Генератор билета · practice / exam</p>
      </div>
      {note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{note}</div>
      )}
      <div className="card grid gap-3 p-5 md:grid-cols-4">
        <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" value={bankId} onChange={(e) => setBankId(e.target.value)}>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>{b.title} ({b.count})</option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (<option key={n} value={n}>{n} вопрос(а)</option>))}
        </select>
        <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "practice" | "exam")}>
          <option value="practice">Практика</option>
          <option value="exam">Экзамен</option>
        </select>
        <button type="button" className="btn-primary inline-flex items-center justify-center gap-2 text-sm md:col-span-4" onClick={generate} disabled={loading || !bankId}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Сгенерировать билет
        </button>
      </div>
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <ol className="space-y-4">
        {questions.map((qq, idx) => (
          <li key={qq.id} className="card p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Вопрос {idx + 1}</div>
            <p className="mt-2 font-medium leading-snug">{qq.text}</p>
            {mode === "practice" && (
              <button type="button" className="mt-3 inline-flex items-center gap-2 text-sm text-primary" onClick={() => setReveal((r) => ({ ...r, [qq.id]: !r[qq.id] }))}>
                <Eye className="h-4 w-4" /> {reveal[qq.id] ? "Скрыть эталон" : "Показать эталон"}
              </button>
            )}
            {reveal[qq.id] && qq.answer && (
              <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: qq.answer.replace(/\n/g, "<br/>") }} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
