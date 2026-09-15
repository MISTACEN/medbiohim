"use client";

import { useEffect, useState } from "react";
import { FileQuestion, Ticket, Shuffle, Play, Loader2 } from "lucide-react";
import { tests as mockTests, ticketPool } from "@/lib/mock-data";
import type { TicketQuestion } from "@/types";
import { Confetti } from "@/components/ui/Confetti";
import { SkeletonCards } from "@/components/ui/Skeleton";
import {
  listTests,
  getTest,
  startTestAttempt,
  finishAttempt,
  type ApiTest,
} from "@/lib/api";

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
  const [celebrate, setCelebrate] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        const res = await listTests();
        if (cancelled) return;
        if (res.ok && res.data.items.length > 0) {
          const mapped: UiTest[] = res.data.items.map((t: ApiTest) => ({
            id: t.id,
            title: t.title || t.name || "Тест",
            subject: t.subject_name || "—",
            type: "test" as const,
            questionCount: t.questions_count,
            status: "доступен",
            fromApi: true,
          }));
          setItems(mapped);
          setSource("api");
          setNote(null);
        } else if (!res.ok) {
          setNote(`API: ${res.error.message} — mock`);
        }
      } catch {
        if (!cancelled) setNote("API недоступен — mock");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = tab === "all" ? items : items.filter((t) => t.type === tab);

  function generateTicket() {
    const pool = ticketPool[subject] || ticketPool["Биология"] || [];
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
      const qs = (detail.data.questions || []).map((q: unknown, i: number) => {
        const row = q as { id?: string; body?: string; text?: string };
        return {
          id: row.id || String(i),
          body: row.body || row.text || "Вопрос",
        };
      });
      setActive({
        testId: id,
        attemptId: attempt.data.attempt.id,
        questions: qs,
        title: detail.data.test.title || detail.data.test.name || "Тест",
      });
    } catch {
      setNote("Не удалось начать тест (нужен login + API)");
    } finally {
      setBusy(false);
    }
  }

  async function completeActive() {
    if (!active) return;
    setBusy(true);
    try {
      await finishAttempt(active.attemptId, active.questions.length, active.questions.length);
      setCelebrate(true);
      setActive(null);
      setNote("Попытка завершена");
    } catch {
      setNote("Ошибка завершения попытки");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Confetti active={celebrate} />
      <div>
        <h1 className="page-title">Тесты и билеты</h1>
        <p className="page-subtitle">
          Источник: {source}
          {note ? ` · ${note}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Все"],
            ["test", "Тесты"],
            ["ticket", "Билеты"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-pill px-4 py-1.5 text-sm font-semibold transition ${
              tab === key
                ? "bg-brand-gradient text-white shadow-card"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-indigo-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="rounded-card border border-white/40 bg-white/60 p-5 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50">
        <h2 className="flex items-center gap-2 font-semibold">
          <Shuffle className="h-5 w-5 text-primary" />
          Генератор билетов
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-soft border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {Object.keys(ticketPool).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" onClick={generateTicket} className="btn-primary">
            Сгенерировать
          </button>
        </div>
        {ticket && (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
            {ticket.map((q) => (
              <li key={q.number}>{q.text || (q as { body?: string }).body}</li>
            ))}
          </ol>
        )}
      </section>

      {active && (
        <section className="card border border-primary/30">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{active.title}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={completeActive}
              className="btn-primary disabled:opacity-50"
            >
              Завершить
            </button>
          </div>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm">
            {active.questions.map((q) => (
              <li key={q.id}>{q.body}</li>
            ))}
          </ol>
          {active.questions.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">Нет вопросов в банке</p>
          )}
        </section>
      )}

      {loadingList ? (
        <SkeletonCards count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((t) => {
            const pct = t.questionCount
              ? Math.min(
                  100,
                  ((t.status === "пройден" ? t.questionCount : 0) / t.questionCount) * 100
                )
              : t.status === "пройден"
                ? 100
                : 15;
            return (
              <div
                key={t.id}
                className="group rounded-card border border-white/50 bg-white/75 p-5 shadow-soft backdrop-blur-md transition hover:-translate-y-1 hover:shadow-lift dark:border-white/10 dark:bg-slate-800/60"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-soft bg-brand-gradient p-2.5 text-white shadow-card">
                    {t.type === "ticket" ? (
                      <Ticket className="h-5 w-5" />
                    ) : (
                      <FileQuestion className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{t.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {t.subject}
                      {t.questionCount != null ? ` · ${t.questionCount} вопр.` : ""}
                      {t.status ? ` · ${t.status}` : ""}
                      {t.fromApi ? " · API" : " · mock"}
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-slate-100 dark:bg-slate-700">
                      <div
                        className="h-full rounded-pill bg-brand-gradient transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {t.fromApi && t.type === "test" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openTest(t.id)}
                      className="btn-pill inline-flex items-center gap-1 text-xs disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      Пройти
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
