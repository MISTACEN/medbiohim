"use client";

import { useEffect, useState } from "react";
import { FileQuestion, Ticket, Shuffle, Play, Loader2 } from "lucide-react";
import { tests as mockTests, ticketPool } from "@/lib/mock-data";
import type { TicketQuestion } from "@/types";
import { listTests, getTest, startTestAttempt, finishAttempt, type ApiTest } from "@/lib/api";

type UiTest = {
  id: string;
  title: string;
  subject: string;
  type: "test" | "ticket";
  questionCount?: number;
  status?: string;
  fromApi: boolean;
};

export default function TestsPage() {
  const [tab, setTab] = useState<"all" | "test" | "ticket">("all");
  const [subject, setSubject] = useState("Гистология");
  const [ticket, setTicket] = useState<TicketQuestion[] | null>(null);
  const [items, setItems] = useState<UiTest[]>(
    mockTests.map((t) => ({
      id: t.id,
      title: t.title,
      subject: t.subject,
      type: t.type,
      questionCount: t.questionCount,
      status: t.status,
      fromApi: false,
    }))
  );
  const [source, setSource] = useState<"mock" | "api">("mock");
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState<{
    testId: string;
    attemptId: string;
    questions: Array<{ id: string; body: string }>;
    title: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listTests();
        if (cancelled) return;
        if (res.ok && res.data.items.length > 0) {
          setItems(
            res.data.items.map((t: ApiTest) => ({
              id: t.id,
              title: t.title,
              subject: t.subject_name || "—",
              type: "test" as const,
              status: t.is_published ? "доступен" : "черновик",
              fromApi: true,
            }))
          );
          setSource("api");
          setNote(null);
        } else if (!res.ok) setNote(`API: ${res.error.message} — mock`);
      } catch {
        if (!cancelled) setNote("API недоступен — mock");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = tab === "all" ? items : items.filter((t) => t.type === tab);

  function generateTicket() {
    const pool = ticketPool[subject] || ticketPool["Биология"];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setTicket(shuffled.slice(0, 4).map((q, i) => ({ ...q, number: i + 1 })));
  }

  async function openTest(id: string) {
    setBusy(true);
    try {
      const detail = await getTest(id);
      if (!detail.ok) {
        setNote(detail.error.message);
        return;
      }
      const attempt = await startTestAttempt(id);
      if (!attempt.ok) {
        setNote(attempt.error.message);
        return;
      }
      setActive({
        testId: id,
        attemptId: attempt.data.attempt.id,
        questions: detail.data.questions || [],
        title: detail.data.test.title,
      });
    } catch {
      setNote("Не удалось начать тест (login + API)");
    } finally {
      setBusy(false);
    }
  }

  async function completeActive() {
    if (!active) return;
    setBusy(true);
    try {
      await finishAttempt(active.attemptId, active.questions.length, active.questions.length);
      setActive(null);
      setNote("Попытка завершена");
    } catch {
      setNote("Ошибка завершения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Тесты и билеты</h1>
        <p className="mt-1 text-gray-500">
          Источник: {source}
          {note ? ` · ${note}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {([["all", "Все"], ["test", "Тесты"], ["ticket", "Билеты"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === key ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600"}`}>{label}</button>
        ))}
      </div>
      <section className="card border-primary/20 bg-primary/5 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Shuffle className="h-5 w-5 text-primary" /> Генератор билетов</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            {Object.keys(ticketPool).map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <button type="button" onClick={generateTicket} className="rounded-lg bg-primary px-4 py-2 text-sm text-white">Сгенерировать</button>
        </div>
        {ticket && (<ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">{ticket.map((q) => (<li key={q.number}>{q.text}</li>))}</ol>)}
      </section>
      {active && (
        <section className="card border border-primary/30 p-5">
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold">{active.title}</h2>
            <button type="button" disabled={busy} onClick={completeActive} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white">Завершить</button>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm">{active.questions.map((q) => (<li key={q.id}>{q.body}</li>))}</ol>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((t) => (
          <div key={t.id} className="card flex items-start gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">{t.type === "ticket" ? <Ticket className="h-5 w-5" /> : <FileQuestion className="h-5 w-5" />}</div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.title}</div>
              <div className="mt-1 text-xs text-gray-500">{t.subject}{t.status ? ` · ${t.status}` : ""} · {t.fromApi ? "API" : "mock"}</div>
            </div>
            {t.fromApi && t.type === "test" && (
              <button type="button" disabled={busy} onClick={() => openTest(t.id)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Начать
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
