"use client";

/** Панель генерации билета: банк, число вопросов, режим и кнопка. */
import { Loader2, RefreshCw } from "lucide-react";
import type { TicketsPageState } from "@/components/tickets/useTicketsPage";

export function TicketControls({ page }: { page: TicketsPageState }) {
  const { banks, bankId, setBankId, count, setCount, mode, setMode, loading, generate, selected } = page;

  return (
    <div className="card grid gap-3 p-5 md:grid-cols-4">
      <select
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
        value={bankId}
        onChange={(e) => setBankId(e.target.value)}
      >
        <option value="">— выберите банк —</option>
        {banks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title} ({b.count})
          </option>
        ))}
      </select>
      <select
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} вопрос(а)
          </option>
        ))}
      </select>
      <select
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={mode}
        onChange={(e) => setMode(e.target.value as "practice" | "exam")}
      >
        <option value="practice">Практика</option>
        <option value="exam">Экзамен</option>
      </select>
      <button
        type="button"
        className="btn-primary inline-flex items-center justify-center gap-2 text-sm md:col-span-4"
        onClick={() => void generate()}
        disabled={loading || !bankId}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Сгенерировать{selected ? ` · ${selected.subject}` : ""}
      </button>
    </div>
  );
}
