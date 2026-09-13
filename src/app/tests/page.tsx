"use client";

import { useState } from "react";
import { FileQuestion, Ticket, ChevronRight, Shuffle } from "lucide-react";
import { tests, ticketPool } from "@/lib/mock-data";
import type { TicketQuestion } from "@/types";

export default function TestsPage() {
  const [tab, setTab] = useState<"all" | "test" | "ticket">("all");
  const [subject, setSubject] = useState("Гистология");
  const [ticket, setTicket] = useState<TicketQuestion[] | null>(null);
  const [startedTest, setStartedTest] = useState<string | null>(null);

  const filtered = tab === "all" ? tests : tests.filter((t) => t.type === tab);

  function generateTicket() {
    const pool = ticketPool[subject] || ticketPool["Биология"];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setTicket(shuffled.slice(0, 4).map((q, i) => ({ ...q, number: i + 1 })));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Тесты и билеты</h1>
        <p className="mt-1 text-gray-500">Проверка знаний и подготовка к экзаменам</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([["all", "Все"], ["test", "Тесты"], ["ticket", "Билеты"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === key ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}>{label}</button>
        ))}
      </div>

      <section className="card border-primary/20 bg-primary/5 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-gray-900">
          <Shuffle className="h-5 w-5 text-primary" /> Генератор билетов
        </h2>
        <p className="mt-1 text-sm text-gray-600">Случайный экзаменационный билет из вопросов предмета.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <select value={subject} onChange={(e) => { setSubject(e.target.value); setTicket(null); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            {Object.keys(ticketPool).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={generateTicket} className="btn-primary text-sm">Сгенерировать билет</button>
        </div>
        {ticket && (
          <div className="mt-5 space-y-3 rounded-xl border border-primary/20 bg-white p-4">
            <div className="text-sm font-medium text-primary">Билет · {subject}</div>
            {ticket.map((q) => (
              <div key={q.number} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{q.number}. {q.kind}</div>
                <div className="mt-1 text-sm text-gray-900">{q.text}</div>
              </div>
            ))}
            <button type="button" className="btn-secondary text-sm" onClick={() => setTicket(null)}>Закрыть</button>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <article key={t.id} className="card p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              {t.type === "ticket" ? <Ticket className="h-5 w-5 text-primary" /> : <FileQuestion className="h-5 w-5 text-primary" />}
            </div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{t.type === "ticket" ? "Билет" : "Тест"}</div>
            <h2 className="mt-1 font-semibold text-gray-900">{t.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              <span>{t.subject}</span><span>·</span><span>{t.questionCount} вопросов</span><span>·</span><span>Курс {t.course}</span>
            </div>
            {t.status && <div className="mt-2 text-xs font-medium text-success">{t.status}</div>}
            {startedTest === t.id ? (
              <div className="mt-4 rounded-lg bg-success/10 p-3 text-sm text-success">
                Попытка создана (демо).
                <button type="button" className="mt-2 block text-primary underline" onClick={() => setStartedTest(null)}>Закрыть</button>
              </div>
            ) : (
              <button type="button" onClick={() => setStartedTest(t.id)}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Начать <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
